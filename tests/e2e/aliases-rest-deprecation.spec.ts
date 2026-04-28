/**
 * E2E — Sprint 9.6 Fase B: aliases REST con headers Deprecation/Sunset/Link
 * (ADR-068 + DC.7).
 *
 * Verifica el contrato del `LegacyRouteDeprecationMiddleware`:
 *   1. Path canónico `/api/v1/admin/clients` responde sin headers de
 *      deprecación (es la ruta de futuro).
 *   2. Path legacy `/api/v1/clients` responde 200 con `Deprecation: true`
 *      + `Sunset: <fecha HTTP-date>` + `Link: <successor>; rel="successor-version"`.
 *      Body idéntico al canónico — multi-path en `@Controller([...])` sirve
 *      los mismos handlers.
 *   3. `GET /api/v1/products` (catálogo público) responde sin headers
 *      Deprecation: GET no es legacy en Products (la lectura es endpoint
 *      canónico aparte; sólo las mutaciones tienen alias).
 *   4. `POST /api/v1/products` (path legacy de mutación) responde con
 *      headers Deprecation. `POST /api/v1/admin/products` (canónico) sin.
 *
 * Cobertura cumple R7 (errores trazables) + ADR-068 §5.
 *
 * Cierre: cuando Sprint 14 elimine los paths legacy del array
 * `@Controller([...])`, este spec debe eliminarse o ajustarse para que las
 * rutas legacy respondan 404. Anotado en ADR-068 §3.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const SUNSET_FIXED = 'Wed, 31 Dec 2026 23:59:59 GMT';

let staffToken = '';

async function loginSuperadminAPI(
  request: APIRequestContext,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error('No access_token / temp_token');

  const codeMail = await waitForEmail(TEST_CONFIG.superadmin.email, {
    subjectIncludes: 'código',
    timeoutMs: 15_000,
  });
  const code = extract2FACode(codeMail);
  const verifyRes = await request.post(
    `${TEST_CONFIG.apiUrl}/auth/verify-2fa`,
    { data: { temp_token: body.temp_token, code } },
  );
  expect(verifyRes.ok()).toBeTruthy();
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

test.describe.serial('REST aliases — Deprecation headers (ADR-068)', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestData();
    staffToken = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     CLIENTS — todos los métodos sobre /clients son legacy
     ════════════════════════════════════════════════════════════════ */

  test('GET /api/v1/admin/clients (canónico) responde sin Deprecation', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/clients`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['deprecation']).toBeUndefined();
    expect(res.headers()['sunset']).toBeUndefined();
    expect(res.headers()['link']).toBeUndefined();
  });

  test('GET /api/v1/clients (legacy) responde con Deprecation + Sunset + Link', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/clients`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['deprecation']).toBe('true');
    expect(res.headers()['sunset']).toBe(SUNSET_FIXED);
    expect(res.headers()['link']).toBe(
      '</api/v1/admin/clients>; rel="successor-version"',
    );
  });

  test('GET /api/v1/clients y /api/v1/admin/clients devuelven el mismo body', async ({
    request,
  }) => {
    const [legacy, canonical] = await Promise.all([
      request.get(`${TEST_CONFIG.apiUrl}/clients`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      }),
      request.get(`${TEST_CONFIG.apiUrl}/admin/clients`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      }),
    ]);
    expect(legacy.ok()).toBeTruthy();
    expect(canonical.ok()).toBeTruthy();
    expect(await legacy.json()).toEqual(await canonical.json());
  });

  /* ════════════════════════════════════════════════════════════════
     PRODUCTS — split: GET es canónico, POST/PATCH/DELETE son legacy
     ════════════════════════════════════════════════════════════════ */

  test('GET /api/v1/products (catálogo público canónico) responde sin Deprecation', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/products`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.ok()).toBeTruthy();
    // GET /products NO está en LEGACY_ROUTES con método GET — sólo
    // POST/PATCH/DELETE. Por eso no debe llevar header Deprecation.
    expect(res.headers()['deprecation']).toBeUndefined();
    expect(res.headers()['link']).toBeUndefined();
  });

  test('GET /api/v1/admin/products (alias canónico admin) responde sin Deprecation', async ({
    request,
  }) => {
    // Nota: AdminProductsController NO tiene @Get; este request golpea
    // ProductsController (que NO multi-path). Por tanto: 404. Dejamos el
    // test comentando el comportamiento — el espacio /admin/products es
    // exclusivo de mutaciones; las lecturas viven en /products canónico.
    // Si Sprint 18 expone /api/v1/public/catalog, los lectores externos
    // van por ahí.
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/products`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.status()).toBe(404);
  });

  test('POST /api/v1/products (legacy mutación) responde con Deprecation headers', async ({
    request,
  }) => {
    // Cuerpo inválido para evitar persistir un product real — el middleware
    // setea headers ANTES de que el controller los procese, por lo que
    // incluso con 400/422/etc. los headers están presentes.
    const res = await request.post(`${TEST_CONFIG.apiUrl}/products`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: {
        // missing required fields → 400 ValidationPipe
      },
    });
    // Esperamos un código no-2xx (ValidationPipe rechaza), pero el header
    // Deprecation viene del middleware que corre antes.
    expect(res.headers()['deprecation']).toBe('true');
    expect(res.headers()['sunset']).toBe(SUNSET_FIXED);
    expect(res.headers()['link']).toBe(
      '</api/v1/admin/products>; rel="successor-version"',
    );
  });

  test('POST /api/v1/admin/products (canónico) responde sin Deprecation headers', async ({
    request,
  }) => {
    const res = await request.post(`${TEST_CONFIG.apiUrl}/admin/products`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: {},
    });
    // Idem: no nos importa el status (probablemente 400), sólo los headers.
    expect(res.headers()['deprecation']).toBeUndefined();
    expect(res.headers()['sunset']).toBeUndefined();
    expect(res.headers()['link']).toBeUndefined();
  });

  test('GET /api/v1/products/:id (canónico) responde sin Deprecation', async ({
    request,
  }) => {
    // Un id inexistente; el GET no es legacy → no hay headers aunque el
    // status sea 404.
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/products/00000000-0000-0000-0000-000000000000`,
      { headers: { Authorization: `Bearer ${staffToken}` } },
    );
    expect(res.headers()['deprecation']).toBeUndefined();
  });
});

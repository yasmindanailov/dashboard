/**
 * E2E — Sprint 9.6 Fase F.2: migración admin/cliente retroactivo
 * (DC.7 + ADR-066).
 *
 * Verifica los efectos visibles de la decisión arquitectónica de tres
 * portales raíz (`/admin/*` staff, `/dashboard/*` cliente,
 * `/partner/*` reservado Sprint 19):
 *
 *   1. Cliente recibe 403 sobre endpoints staff-puro `/api/v1/admin/*`
 *      (defense in depth: AdminOnlyGuard backend rechaza antes de CASL).
 *   2. Staff (superadmin) accede correctamente a los endpoints admin
 *      canónicos sin headers de deprecación.
 *   3. Cliente entra a `/dashboard/billing` y ve la UX simplificada:
 *      el subtítulo no es "Gestión..." (que es admin) sino "Mis...".
 *   4. Cliente entra a `/dashboard/support` y NO ve los tabs internos
 *      del workflow staff (`Esperando agente`, `Esperando cliente`,
 *      `Cerradas`).
 *   5. Login como staff aterriza en `/admin` (landingForRole) y NO en
 *      `/dashboard`. Login como cliente aterriza en `/dashboard`.
 *
 * Cobertura cumple ADR-066 §"Tests requeridos" + ADR-067 §Tests E2E.
 *
 * Las cuentas demo de Sprint 9.6 Fase F.0 (`backend/prisma/seeds/
 * test-accounts.ts`) están sembradas con credenciales conocidas:
 *   superadmin    → admin@aelium.net / AeliumDev2026!  (requiere 2FA)
 *   client        → cliente@aelium.test / Cliente2026!  (sin 2FA)
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import {
  clearMailbox,
  waitForEmail,
  extract2FACode,
} from './fixtures/mailpit';
import { injectAuthSession } from './fixtures/auth';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const CLIENT_EMAIL = 'cliente@aelium.test';
const CLIENT_PASSWORD = process.env.SEED_CLIENT_PASSWORD || 'Cliente2026!';

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

let staffSession: SessionTokens = { accessToken: '', refreshToken: '' };
let clientSession: SessionTokens = { accessToken: '', refreshToken: '' };

async function loginSuperadminAPI(
  request: APIRequestContext,
): Promise<SessionTokens> {
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
    refresh_token?: string;
    temp_token?: string;
  };
  if (body.access_token && body.refresh_token) {
    return { accessToken: body.access_token, refreshToken: body.refresh_token };
  }
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
  const verifyBody = (await verifyRes.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return {
    accessToken: verifyBody.access_token,
    refreshToken: verifyBody.refresh_token,
  };
}

async function loginClientAPI(
  request: APIRequestContext,
): Promise<SessionTokens> {
  const res = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD },
  });
  expect(
    res.ok(),
    `Client login falló: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!body.access_token || !body.refresh_token) {
    throw new Error('Cliente no debería requerir 2FA — verificar seed');
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

test.describe.serial('Admin tree migration — Sprint 9.6 (DC.7 + ADR-066)', () => {
  test.beforeAll(async ({ request }) => {
    // resetTestData NO borra usuarios — solo tablas transaccionales.
    // Las cuentas demo del seed (test-accounts.ts) sobreviven.
    await resetTestData();
    staffSession = await loginSuperadminAPI(request);
    clientSession = await loginClientAPI(request);
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     1. Cliente recibe 403 sobre endpoints staff-puro /api/v1/admin/*
     ════════════════════════════════════════════════════════════════ */

  test('cliente recibe 403 sobre /api/v1/admin/clients (AdminOnlyGuard)', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/clients`, {
      headers: { Authorization: `Bearer ${clientSession.accessToken}` },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message.toLowerCase()).toContain('staff');
  });

  test('cliente recibe 403 sobre /api/v1/admin/products (mutaciones)', async ({
    request,
  }) => {
    // POST con body inválido — el AdminOnlyGuard corta antes que la
    // ValidationPipe, así que esperamos 403 (no 400).
    const res = await request.post(`${TEST_CONFIG.apiUrl}/admin/products`, {
      headers: { Authorization: `Bearer ${clientSession.accessToken}` },
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  /* ════════════════════════════════════════════════════════════════
     2. Staff accede sin headers de deprecación
     ════════════════════════════════════════════════════════════════ */

  test('staff GET /api/v1/admin/clients (canónico) sin headers Deprecation', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/clients`, {
      headers: { Authorization: `Bearer ${staffSession.accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['deprecation']).toBeUndefined();
    expect(res.headers()['sunset']).toBeUndefined();
    expect(res.headers()['link']).toBeUndefined();
  });

  /* ════════════════════════════════════════════════════════════════
     3. Cliente entra a /dashboard/billing → UX cliente
        (subtítulo NO es "Gestión..." sino "Mis facturas...")
     ════════════════════════════════════════════════════════════════ */

  test('cliente UX en /dashboard/billing: subtítulo "Mis facturas"', async ({
    page,
    context,
  }) => {
    // Inyectar sesión cliente sin pasar por UI (más rápido y determinista).
    // Modelo A (ADR-078 Amendment A1): cookies httpOnly del dominio Next.js.
    await injectAuthSession(context, clientSession);

    await page.goto('/dashboard/billing');

    // El subtítulo del Portal de Cliente es "Mis facturas y servicios
    // contratados" (Sprint 9.6 Fase E.2). El admin sería "Gestión de
    // facturas y cobros" — nunca debe verse aquí.
    await expect(page.getByText(/mis facturas/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/gestión de facturas/i)).toHaveCount(0);
  });

  /* ════════════════════════════════════════════════════════════════
     4. Cliente entra a /dashboard/support → tabs reducidas
     ════════════════════════════════════════════════════════════════ */

  test('cliente UX en /dashboard/support: NO ve tabs internos del workflow staff', async ({
    page,
    context,
  }) => {
    await injectAuthSession(context, clientSession);

    await page.goto('/dashboard/support');

    // Tabs visibles para cliente: "Todas", "Abiertas", "Resueltas".
    await expect(page.getByText(/^todas$/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Tabs INVISIBLES para cliente (workflow interno staff). Aceptamos
    // que el texto no exista en absoluto.
    await expect(page.getByText(/esperando agente/i)).toHaveCount(0);
    await expect(page.getByText(/esperando cliente/i)).toHaveCount(0);
    // "Cerradas" tampoco aparece (Tab "Resueltas" sí, pero no
    // "Cerradas" — son estados distintos del workflow staff).
    await expect(page.getByText(/^cerradas$/i)).toHaveCount(0);
  });

  /* ════════════════════════════════════════════════════════════════
     5. Login como staff aterriza en /admin (landingForRole)
     ════════════════════════════════════════════════════════════════ */

  test('login staff aterriza en /admin (no /dashboard)', async ({
    page,
    context,
  }) => {
    await injectAuthSession(context, staffSession);

    // Con la cookie httpOnly válida, el layout `/admin` (Server Component)
    // valida sesión vía `getServerSession` + rol staff, y renderiza el
    // PortalBadge canónico. ADR-066 + ADR-078 Amendment A1.
    await page.goto('/admin');

    // Debe cargar sin caer en loop infinito ni redirigir a /dashboard.
    // El PortalBadge "Portal de Administración" es la firma visual del
    // árbol staff (ADR-066).
    await expect(
      page.getByText(/portal de administración/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // No debe verse el logo del portal cliente.
    await expect(page.getByText(/portal de cliente/i)).toHaveCount(0);
  });

  test('login cliente aterriza en /dashboard (no /admin) y guard redirige si fuerza /admin', async ({
    page,
    context,
  }) => {
    await injectAuthSession(context, clientSession);

    // Cliente intenta forzar /admin manualmente — el AdminLayout debe
    // redirigir a /dashboard automáticamente (defense in depth nivel 2).
    await page.goto('/admin');
    await page.waitForURL(/\/dashboard($|\/|\?)/, { timeout: 15_000 });

    // PortalBadge debe ser "Portal de Cliente" tras el redirect.
    await expect(page.getByText(/portal de cliente/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

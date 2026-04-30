/**
 * E2E — Sprint 8 Fase B.2 + B.4 (2026-04-29).
 *
 * B.2 (UI_SPEC §5.16 sidebar Servicio + bloque adaptativo de servicio,
 *      generalizado en B.7 ADR-073 a cualquier tipo con service_id):
 *   - GET /tasks/:id devuelve `service` poblado con product/amount/cycle
 *     cuando task.service_id no es null (`INCLUDE_RELATIONS_DETAIL`).
 *   - GET /tasks/:id sin service_id devuelve `service` undefined/null
 *     (degradación elegante para tareas internas tipo `custom_work`).
 *   - GET /tasks (lista) NO incluye `service` para mantener el tablero
 *     ligero (regresión: si la lista empieza a traerlo se pierde el
 *     beneficio de tener INCLUDE separado).
 *
 * B.4 (decisión Sprint 8 §3.4 + UI_SPEC §5.16):
 *   - Tras `tasks.complete()` con internal_notes, la `ClientNote`
 *     persistida tiene `task_id` + `category=solution`.
 *   - GET /admin/clients/:id/structured-notes enriquece con
 *     `task_title` + `task_type` cuando `task_id` está poblado.
 *   - Notas creadas SIN task_id (vía endpoint clásico) traen
 *     `task_title=null` + `task_type=null` (no rompe el shape).
 *
 * Spec aislado del resto para que los fixes sean reversibles.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import {
  clearMailbox,
  waitForEmail,
  extract2FACode,
} from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;
let agentSupportId: string;
let clientUserId: string;
let productId: string;
let serviceId: string;

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
  if (!body.temp_token) throw new Error('superadmin sin token');
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

async function createUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
}): Promise<string> {
  const roleRes = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [
    opts.roleSlug,
  ]);
  const passwordHash = await bcrypt.hash('TestPassword123!', 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [
      opts.email,
      passwordHash,
      opts.firstName,
      opts.lastName,
      roleRes.rows[0].id,
    ],
  );
  return res.rows[0].id as string;
}

async function authed(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
) {
  return request.fetch(`${TEST_CONFIG.apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: body ? JSON.stringify(body) : undefined,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Tasks — detail enrichment (B.2) + notes con task origen (B.4)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    agentSupportId = await createUser({
      email: 'e2e-detail-agent@aelium.test',
      firstName: 'Andrea',
      lastName: 'Detail',
      roleSlug: 'agent_support',
    });
    clientUserId = await createUser({
      email: 'e2e-detail-client@aelium.test',
      firstName: 'Carlos',
      lastName: 'Detail',
      roleSlug: 'client',
    });

    // Crear producto + servicio mínimo para test B.2 service enrichment.
    // El módulo tasks NO valida coherencia client/service hoy
    // (deuda EC-T8-13 pendiente). Aquí lo creamos correctamente alineado
    // con el schema canónico de `products` (status enum, sin pricing
    // inline — ProductPricing es tabla aparte que no necesitamos para
    // este test porque enrichment de Service trae amount inline).
    //
    // Slug con timestamp para no colisionar con runs previos en el mismo
    // entorno dev (resetTestData no purga products — el seed de muestra
    // los repuebla idempotente). Producto demo aislado por ejecución.
    const slug = `cloud-office-e2e-${Date.now()}`;
    const productRes = await pool.query(
      `INSERT INTO products (name, slug, type, status, created_at, updated_at)
       VALUES ('Cloud Office Pro (E2E)', $1, 'docker_service', 'active', NOW(), NOW())
       RETURNING id`,
      [slug],
    );
    productId = productRes.rows[0].id as string;

    const serviceRes = await pool.query(
      `INSERT INTO services (user_id, product_id, status, label, domain, billing_cycle, amount, currency, created_at, updated_at)
       VALUES ($1, $2, 'active', 'Cloud Office Carlos', 'carlos.cloud.aelium.net', 'monthly', 49.99, 'EUR', NOW(), NOW())
       RETURNING id`,
      [clientUserId, productId],
    );
    serviceId = serviceRes.rows[0].id as string;

    token = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     B.2 — detail enrichment con service + product
     ════════════════════════════════════════════════════════════════ */

  test('B.2 — GET /tasks/:id con service_id devuelve service+product', async ({
    request,
  }) => {
    const createRes = await authed(request, token, 'POST', '/tasks', {
      type: 'contact_client',
      title: 'B.2 wow call con servicio',
      priority: 'high',
      client_id: clientUserId,
      service_id: serviceId,
      assigned_to: agentSupportId,
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as { id: string };

    const detailRes = await authed(
      request,
      token,
      'GET',
      `/tasks/${created.id}`,
    );
    expect(detailRes.ok()).toBeTruthy();
    const task = (await detailRes.json()) as {
      service: {
        id: string;
        label: string | null;
        domain: string | null;
        status: string;
        amount: string | number;
        billing_cycle: string;
        currency: string;
        product: {
          id: string;
          name: string;
          slug: string;
          type: string;
        } | null;
      } | null;
    };
    expect(task.service).toBeTruthy();
    expect(task.service?.id).toBe(serviceId);
    expect(task.service?.label).toBe('Cloud Office Carlos');
    expect(task.service?.domain).toBe('carlos.cloud.aelium.net');
    expect(task.service?.status).toBe('active');
    expect(task.service?.billing_cycle).toBe('monthly');
    expect(task.service?.currency).toBe('EUR');
    expect(task.service?.product).toBeTruthy();
    expect(task.service?.product?.name).toBe('Cloud Office Pro (E2E)');
    expect(task.service?.product?.type).toBe('docker_service');
  });

  test('B.2 — GET /tasks/:id sin service_id: service es null', async ({
    request,
  }) => {
    const createRes = await authed(request, token, 'POST', '/tasks', {
      type: 'custom_work',
      title: 'B.2 task sin servicio',
      priority: 'low',
      client_id: clientUserId,
      assigned_to: agentSupportId,
    });
    const created = (await createRes.json()) as { id: string };

    const detailRes = await authed(
      request,
      token,
      'GET',
      `/tasks/${created.id}`,
    );
    expect(detailRes.ok()).toBeTruthy();
    const task = (await detailRes.json()) as { service: unknown };
    // Prisma serializa la relación opcional ausente como `null`.
    expect(task.service).toBeNull();
  });

  test('B.2 — GET /tasks (lista) NO incluye service (regresión)', async ({
    request,
  }) => {
    const listRes = await authed(request, token, 'GET', '/tasks?limit=5');
    expect(listRes.ok()).toBeTruthy();
    const body = (await listRes.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(body.data.length).toBeGreaterThan(0);
    // INCLUDE_RELATIONS ligero del findAll no trae `service` — la lista
    // se mantiene barata. Si esto cambia, el tablero pagaría joins
    // innecesarios y violaría la decisión de Sprint 8 Fase B.2.
    for (const item of body.data) {
      expect(item.service).toBeUndefined();
    }
  });

  /* ════════════════════════════════════════════════════════════════
     B.4 — notes con task origen enriched
     ════════════════════════════════════════════════════════════════ */

  test('B.4 — completar task con internal_notes crea ClientNote con task_id + category=solution', async ({
    request,
  }) => {
    const createRes = await authed(request, token, 'POST', '/tasks', {
      type: 'maintenance',
      title: 'B.4 mantenimiento mensual abril',
      priority: 'medium',
      client_id: clientUserId,
      service_id: serviceId,
      assigned_to: agentSupportId,
    });
    const task = (await createRes.json()) as { id: string };

    const completeRes = await authed(
      request,
      token,
      'PATCH',
      `/tasks/${task.id}/complete`,
      {
        client_notes: 'Cliente notificado por email — todo OK.',
        internal_notes:
          'Actualicé core a v2.5, plugins SSL, backup completo verificado.',
      },
    );
    expect(completeRes.ok()).toBeTruthy();

    // Verificar persistencia directa en BD (audit + nota)
    const noteRes = await pool.query(
      `SELECT task_id, category, body
       FROM client_notes
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [clientUserId],
    );
    expect(noteRes.rowCount).toBeGreaterThanOrEqual(1);
    expect(noteRes.rows[0].task_id).toBe(task.id);
    expect(noteRes.rows[0].category).toBe('solution');
    expect(noteRes.rows[0].body).toContain('Actualicé core');
  });

  test('B.4 — GET /admin/clients/:id/structured-notes enriquece task_title + task_type', async ({
    request,
  }) => {
    const notesRes = await authed(
      request,
      token,
      'GET',
      `/admin/clients/${clientUserId}/structured-notes?limit=10`,
    );
    expect(notesRes.ok()).toBeTruthy();
    const body = (await notesRes.json()) as {
      data: Array<{
        task_id: string | null;
        task_title: string | null;
        task_type: string | null;
        category: string | null;
      }>;
    };
    const noteWithTask = body.data.find((n) => n.task_id !== null);
    expect(noteWithTask).toBeDefined();
    expect(noteWithTask?.task_title).toBe('B.4 mantenimiento mensual abril');
    expect(noteWithTask?.task_type).toBe('maintenance');
    expect(noteWithTask?.category).toBe('solution');
  });

  test('B.4 — nota creada SIN task_id (endpoint estructurado clásico) trae task_title=null', async ({
    request,
  }) => {
    // Crear nota directa por el endpoint clásico (no via task.complete)
    const createRes = await authed(
      request,
      token,
      'POST',
      `/admin/clients/${clientUserId}/structured-notes`,
      {
        body: 'Nota suelta sin task de origen',
        category: 'general',
      },
    );
    expect(createRes.ok()).toBeTruthy();

    const notesRes = await authed(
      request,
      token,
      'GET',
      `/admin/clients/${clientUserId}/structured-notes?limit=20`,
    );
    const body = (await notesRes.json()) as {
      data: Array<{
        body: string;
        task_id: string | null;
        task_title: string | null;
        task_type: string | null;
      }>;
    };
    const orphan = body.data.find((n) =>
      n.body.includes('Nota suelta sin task'),
    );
    expect(orphan).toBeDefined();
    expect(orphan?.task_id).toBeNull();
    expect(orphan?.task_title).toBeNull();
    expect(orphan?.task_type).toBeNull();
  });
});

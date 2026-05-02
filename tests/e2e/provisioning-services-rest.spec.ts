/**
 * E2E — Sprint 11 Fase 11.D — Provisioning REST endpoints (cliente + admin).
 *
 * Cubre los 7 endpoints nuevos de la fase:
 *   Cliente (`/api/v1/services/*`):
 *     - GET    /services                    → ownership filtra por user_id
 *     - GET    /services/:id                → ownership 403 si no es dueño
 *     - POST   /services/:id/sso            → null para plugins triviales
 *     - POST   /services/:id/actions/:slug  → INVALID_PAYLOAD (catálogo vacío)
 *
 *   Admin (`/api/v1/admin/services/*`):
 *     - GET    /admin/services              → vista global con filtros
 *     - POST   /admin/services/:id/reprovision → enqueue + audit
 *     - POST   /admin/services/:id/deprovision → status=cancelled + audit
 *
 * Validaciones cross-cutting:
 *   - CASL `Subject.Service` refinado por rol (cliente Read/List/Update,
 *     agent_full Manage, agent_billing Read/List, agent_support Read/List).
 *   - AdminOnlyGuard en `/admin/services/*` cierra primera línea.
 *   - Ownership server-side: el cliente NO puede ver el service de otro
 *     cliente aunque conozca el UUID.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const PASSWORD = 'TestPassword123!';

let pool: Pool;
let clientAUserId: string;
let clientBUserId: string;
let serviceAId: string;
let serviceBId: string;
let hostingProductId: string;

async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(
    loginRes.ok(),
    `Login ${email} falló: ${loginRes.status()} ${await loginRes.text()}`,
  ).toBeTruthy();
  const body = (await loginRes.json()) as {
    temp_token?: string;
    access_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) {
    throw new Error(`Login ${email} sin access_token ni temp_token`);
  }
  const codeMail = await waitForEmail(email, {
    subjectIncludes: 'código',
    timeoutMs: 15_000,
  });
  const code = extract2FACode(codeMail);
  const verifyRes = await request.post(
    `${TEST_CONFIG.apiUrl}/auth/verify-2fa`,
    { data: { temp_token: body.temp_token, code } },
  );
  expect(verifyRes.ok()).toBeTruthy();
  return ((await verifyRes.json()) as { access_token: string }).access_token;
}

async function getRoleId(slug: string): Promise<string> {
  const res = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (!res.rows[0]) throw new Error(`Role ${slug} not found`);
  return res.rows[0].id as string;
}

async function createUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
}): Promise<string> {
  const roleId = await getRoleId(opts.roleSlug);
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [opts.email, passwordHash, opts.firstName, opts.lastName, roleId],
  );
  return res.rows[0].id as string;
}

async function authedFetch(
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

test.describe('Provisioning REST — Sprint 11 Fase 11.D (cliente + admin)', () => {
  let superadminToken: string;
  let clientAToken: string;
  let clientBToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    clientAUserId = await createUser({
      email: 'e2e-rest-client-a@aelium.test',
      firstName: 'ClienteA',
      lastName: 'Rest',
      roleSlug: 'client',
    });
    clientBUserId = await createUser({
      email: 'e2e-rest-client-b@aelium.test',
      firstName: 'ClienteB',
      lastName: 'Rest',
      roleSlug: 'client',
    });

    // Hosting Pro (provisioner=manual) — usamos su id para crear services.
    const hostingQ = await pool.query(
      `SELECT id FROM products WHERE slug = 'hosting-pro' LIMIT 1`,
    );
    if (!hostingQ.rows[0]) {
      throw new Error('Seed sample-products no aplicado: falta hosting-pro.');
    }
    hostingProductId = hostingQ.rows[0].id as string;

    // 2 services en estados distintos para cubrir varios casos.
    const svcA = await pool.query(
      `INSERT INTO services (user_id, product_id, status, label, billing_cycle, amount, currency, provisioner_slug)
       VALUES ($1, $2, 'active', 'cliente-a.example', 'monthly', 12.00, 'EUR', 'manual')
       RETURNING id`,
      [clientAUserId, hostingProductId],
    );
    serviceAId = svcA.rows[0].id as string;

    const svcB = await pool.query(
      `INSERT INTO services (user_id, product_id, status, label, billing_cycle, amount, currency, provisioner_slug)
       VALUES ($1, $2, 'pending', 'cliente-b.example', 'monthly', 12.00, 'EUR', 'manual')
       RETURNING id`,
      [clientBUserId, hostingProductId],
    );
    serviceBId = svcB.rows[0].id as string;

    superadminToken = await login(
      request,
      TEST_CONFIG.superadmin.email,
      SUPERADMIN_PASSWORD,
    );
    clientAToken = await login(request, 'e2e-rest-client-a@aelium.test', PASSWORD);
    clientBToken = await login(request, 'e2e-rest-client-b@aelium.test', PASSWORD);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  // ─── Cliente endpoints ───────────────────────────────────────────────

  test('Cliente GET /services → solo sus propios servicios (ownership server-side)', async ({
    request,
  }) => {
    const res = await authedFetch(request, clientAToken, 'GET', '/services');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: Array<{ id: string; user_id: string }>;
      meta: { total: number };
    };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const svc of body.data) {
      expect(svc.user_id).toBe(clientAUserId);
    }
    // El service del cliente B NO aparece aunque el cliente A le pase su UUID
    // (este test cubre ownership a nivel de listado).
    expect(body.data.find((s) => s.id === serviceBId)).toBeUndefined();
  });

  test('Cliente GET /services/:id → ownership 403 cuando intenta ver el service ajeno', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      clientAToken,
      'GET',
      `/services/${serviceBId}`,
    );
    expect(res.status()).toBe(403);
  });

  test('Cliente GET /services/:id → 200 + ServiceInfo del plugin manual cuando es propio', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      clientAToken,
      'GET',
      `/services/${serviceAId}`,
    );
    expect(
      res.ok(),
      `Detail falló: ${res.status()} ${await res.text()}`,
    ).toBeTruthy();
    const body = (await res.json()) as {
      service: { id: string; provisioner_slug: string };
      info: {
        status: string;
        capabilities: { has_sso_panel: boolean; completes_via_task: boolean };
      };
    };
    expect(body.service.id).toBe(serviceAId);
    expect(body.service.provisioner_slug).toBe('manual');
    // Plugin `manual` mapea status (DB='active') → ServiceInfo.status='active'.
    expect(body.info.status).toBe('active');
    expect(body.info.capabilities.has_sso_panel).toBe(false);
    expect(body.info.capabilities.completes_via_task).toBe(true);
  });

  test('Cliente POST /services/:id/sso → null para plugin manual (no soporta SSO)', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      clientAToken,
      'POST',
      `/services/${serviceAId}/sso`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { sso: unknown };
    // Plugin manual.capabilities.has_sso_panel=false → wrapper devuelve null.
    expect(body.sso).toBeNull();
  });

  test('Cliente POST /services/:id/actions/:slug → success=false con catálogo vacío', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      clientAToken,
      'POST',
      `/services/${serviceAId}/actions/whatever-slug`,
      { payload: {} },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { success: boolean; message?: string };
    // Wrapper executeActionWithCacheInvalidation valida slug ∈ inlineActions
    // y devuelve success:false con mensaje 'action.unknown' antes de llamar
    // al plugin. Plugin manual tiene inlineActions=[] así que cualquier
    // slug será rechazado.
    expect(body.success).toBe(false);
    expect(body.message).toBe('action.unknown');
  });

  // ─── Admin endpoints ─────────────────────────────────────────────────

  test('Admin GET /admin/services → vista global con filtros (provisioner_slug=manual)', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      superadminToken,
      'GET',
      '/admin/services?provisioner_slug=manual',
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: Array<{ id: string; provisioner_slug: string }>;
      meta: { total: number };
    };
    // Al menos los 2 services creados en beforeAll deben aparecer.
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    for (const svc of body.data) {
      expect(svc.provisioner_slug).toBe('manual');
    }
  });

  test('Admin GET /admin/services → cliente recibe 403 (AdminOnlyGuard)', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      clientAToken,
      'GET',
      '/admin/services',
    );
    expect(res.status()).toBe(403);
  });

  test('Admin POST /admin/services/:id/reprovision → 202 + audit logChange', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      superadminToken,
      'POST',
      `/admin/services/${serviceBId}/reprovision`,
    );
    expect(res.status()).toBe(202);
    const body = (await res.json()) as { enqueued: boolean };
    expect(body.enqueued).toBe(true);

    // Verificar audit_change_log tiene fila para esta acción.
    const auditQ = await pool.query(
      `SELECT action FROM audit_change_log
       WHERE entity_type = 'Service' AND entity_id = $1
         AND action = 'service.reprovision_requested'
       ORDER BY created_at DESC LIMIT 1`,
      [serviceBId],
    );
    expect(auditQ.rowCount).toBeGreaterThanOrEqual(1);
  });

  test('Admin POST /admin/services/:id/deprovision → status=cancelled + audit', async ({
    request,
  }) => {
    const res = await authedFetch(
      request,
      superadminToken,
      'POST',
      `/admin/services/${serviceBId}/deprovision`,
      { reason: 'admin_override', notes: 'cancelación E2E test' },
    );
    expect(
      res.ok(),
      `Deprovision falló: ${res.status()} ${await res.text()}`,
    ).toBeTruthy();
    const body = (await res.json()) as {
      status: string;
      cancellation_reason: string;
    };
    expect(body.status).toBe('cancelled');
    expect(body.cancellation_reason).toContain('admin_override');

    // Verificar BD también refleja el cambio.
    const svcQ = await pool.query(
      `SELECT status, cancellation_reason FROM services WHERE id = $1`,
      [serviceBId],
    );
    expect(svcQ.rows[0].status).toBe('cancelled');
    expect(svcQ.rows[0].cancellation_reason).toContain('admin_override');
  });
});

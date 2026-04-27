/**
 * E2E — Sprint 9 Fase F: /api/v1/admin/error-log + /admin/jobs (DC.7).
 *
 * Verifica:
 *   1. AdminOnlyGuard bloquea cliente con 403 sobre /api/v1/admin/* (defense
 *      in depth: corta antes de CASL).
 *   2. Staff (superadmin) lista error-log y marca como resuelto.
 *   3. Staff lista failed_jobs (vacío en CI tras reset, aceptable — el
 *      flujo de reintento lo cubre el spec del Sprint 9 Fase F.6 si hay
 *      job real fallido pendiente; aquí basta con shape).
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;
let clientToken = '';
let staffToken = '';

async function loginSuperadminAPI(request: APIRequestContext): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(
    loginRes.ok(),
    `Login falló: ${loginRes.status()} ${await loginRes.text()}`,
  ).toBeTruthy();
  const body = (await loginRes.json()) as {
    requires_2fa?: boolean;
    temp_token?: string;
    access_token?: string;
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

async function createClientAndLogin(
  request: APIRequestContext,
): Promise<string> {
  const email = `e2e-admin-guard-${Date.now()}@aelium.test`;
  const password = 'ClientPass2026!';
  const hash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, role_id, email_verified_at)
     VALUES ($1, $2, 'E2E', 'Client', 'active',
       (SELECT id FROM roles WHERE slug = 'client'), now())`,
    [email, hash],
  );

  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Cliente sin access_token');
  return body.access_token;
}

test.describe.serial('Admin /admin/* — Sprint 9 Fase F (DC.7)', () => {
  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await resetTestData();
    staffToken = await loginSuperadminAPI(request);
    clientToken = await createClientAndLogin(request);
  });

  test.afterAll(async () => {
    await disconnectDb();
    await pool.end();
  });

  test('cliente recibe 403 al pedir /admin/error-log (AdminOnlyGuard)', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/error-log`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('staff');
  });

  test('cliente recibe 403 al pedir /admin/jobs/failed', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/jobs/failed`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('staff lista /admin/error-log con paginación + filtros', async ({
    request,
  }) => {
    // Insertamos un error de prueba directo en DB para tener al menos 1 fila.
    const insertRes = await pool.query(
      `INSERT INTO error_log (level, module, message, metadata)
       VALUES ('error', 'e2e-test', 'Error de prueba Sprint 9 Fase F', '{}'::jsonb)
       RETURNING id`,
    );
    const errId = insertRes.rows[0].id as string;

    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/error-log?level=error&page=1&limit=10`,
      { headers: { Authorization: `Bearer ${staffToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: Array<{ id: string; level: string; module: string; message: string }>;
      meta: { total: number; page: number; limit: number };
    };
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(10);
    expect(body.data.find((e) => e.id === errId)).toBeTruthy();
    expect(body.data.find((e) => e.id === errId)?.level).toBe('error');
  });

  test('staff marca error como resuelto → metadata.resolved=true', async ({
    request,
  }) => {
    const insertRes = await pool.query(
      `INSERT INTO error_log (level, module, message)
       VALUES ('warn', 'e2e-resolve', 'Warn a resolver')
       RETURNING id`,
    );
    const errId = insertRes.rows[0].id as string;

    const res = await request.patch(
      `${TEST_CONFIG.apiUrl}/admin/error-log/${errId}/resolve`,
      { headers: { Authorization: `Bearer ${staffToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { resolved: true };
    expect(body.resolved).toBe(true);

    const row = await pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM error_log WHERE id = $1`,
      [errId],
    );
    expect(row.rows[0].metadata.resolved).toBe(true);
    expect(row.rows[0].metadata.resolved_by).toBeTruthy();
    expect(row.rows[0].metadata.resolved_at).toBeTruthy();
  });

  test('staff lista /admin/jobs/failed (shape correcto, vacío OK)', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/jobs/failed?page=1&limit=10`,
      { headers: { Authorization: `Bearer ${staffToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: unknown[];
      meta: { total: number; page: number; limit: number };
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.page).toBe(1);
  });

  test('reintento de failed_job: setup directo en DB → POST /retry → status retrying + audit', async ({
    request,
  }) => {
    // Insertamos un failed_job sintético (cola pdf-generation, payload mínimo).
    const insertRes = await pool.query(
      `INSERT INTO failed_jobs (bull_job_id, queue, name, payload, last_error, attempts_made, status)
       VALUES ('synthetic-1', 'pdf-generation', 'invoice-pdf', '{"invoice_id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
         'fake error for retry test', 5, 'failed')
       RETURNING id`,
    );
    const jobId = insertRes.rows[0].id as string;

    const res = await request.post(
      `${TEST_CONFIG.apiUrl}/admin/jobs/${jobId}/retry`,
      { headers: { Authorization: `Bearer ${staffToken}` } },
    );
    expect(
      res.ok(),
      `Retry falló: ${res.status()} ${await res.text()}`,
    ).toBeTruthy();
    const body = (await res.json()) as { retried: true };
    expect(body.retried).toBe(true);

    const row = await pool.query<{
      status: string;
      retried_at: Date | null;
      retried_by: string | null;
    }>(
      `SELECT status, retried_at, retried_by FROM failed_jobs WHERE id = $1`,
      [jobId],
    );
    expect(row.rows[0].status).toBe('retrying');
    expect(row.rows[0].retried_at).not.toBeNull();
    expect(row.rows[0].retried_by).not.toBeNull();
  });
});

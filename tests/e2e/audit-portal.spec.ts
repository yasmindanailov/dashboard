/**
 * E2E — Sprint 9 Fase E: Audit centralizado + portal transparencia.
 *
 * Verifica el flujo end-to-end del cumplimiento RGPD §Transparency:
 *   1. Setup: cliente + factura del cliente.
 *   2. Admin (staff) lee la factura via GET /api/v1/billing/invoices/:id —
 *      el `AuditInterceptor` registra fila en `audit_access_log` con
 *      `metadata.target_user_id = client.id`, `actor_role` staff.
 *   3. El cliente entra a `/api/v1/audit/access` y SOLO ve filas cuyo
 *      `target_user_id` coincide con su id.
 *   4. Otro cliente NO ve los accesos del primero (filtro ownership).
 *
 * Cubre ADR-017 + ADR-010 + R3 + R7.
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
let staffToken = '';
let clientToken = '';
let clientUserId = '';
let invoiceId = '';

async function loginSuperadminAPI(request: APIRequestContext): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as {
    requires_2fa?: boolean;
    temp_token?: string;
    access_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error('No token');

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
  emailPrefix: string,
): Promise<{ token: string; userId: string }> {
  const email = `${emailPrefix}-${Date.now()}@aelium.test`;
  const password = 'ClientPass2026!';
  const hash = await bcrypt.hash(password, 12);

  const res = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, role_id, email_verified_at)
     VALUES ($1, $2, 'E2E', 'Audit', 'active',
       (SELECT id FROM roles WHERE slug = 'client'), now())
     RETURNING id`,
    [email, hash],
  );
  const userId = res.rows[0].id;

  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Cliente sin access_token');
  return { token: body.access_token, userId };
}

test.describe.serial('Audit portal — Sprint 9 Fase E (ADR-017 + RGPD)', () => {
  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await resetTestData();
    staffToken = await loginSuperadminAPI(request);
    const c = await createClientAndLogin(request, 'audit-client');
    clientToken = c.token;
    clientUserId = c.userId;

    // Crear factura del cliente vía admin API (un superadmin puede crear
    // facturas con targetUserId).
    const createRes = await request.post(
      `${TEST_CONFIG.apiUrl}/billing/invoices`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {
          user_id: clientUserId,
          due_date: new Date(Date.now() + 7 * 86400_000).toISOString(),
          currency: 'EUR',
          items: [
            {
              description: 'Item E2E audit',
              quantity: 1,
              unit_price: 100,
            },
          ],
        },
      },
    );
    expect(
      createRes.ok(),
      `Crear factura falló: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    invoiceId = ((await createRes.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    await disconnectDb();
    await pool.end();
  });

  test('admin lee factura del cliente → audit_access_log registra el acceso', async ({
    request,
  }) => {
    // Limpia rows previas para que el assert sea determinista.
    await pool.query(
      `DELETE FROM audit_access_log
       WHERE metadata->>'target_user_id' = $1`,
      [clientUserId],
    );

    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/billing/invoices/${invoiceId}`,
      { headers: { Authorization: `Bearer ${staffToken}` } },
    );
    expect(res.ok()).toBeTruthy();

    // Damos un pequeño margen a `tap()` async (el interceptor llama
    // logAccess sin await fuera del flujo del response).
    await new Promise((r) => setTimeout(r, 300));

    const rows = await pool.query<{
      action: string;
      resource: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, resource, metadata FROM audit_access_log
       WHERE metadata->>'target_user_id' = $1
       ORDER BY created_at DESC LIMIT 1`,
      [clientUserId],
    );
    expect(rows.rowCount).toBe(1);
    const row = rows.rows[0];
    expect(row.action).toBe('read');
    expect(row.resource).toContain('Invoice');
    expect(row.metadata.resource_type).toBe('Invoice');
    expect(row.metadata.target_user_id).toBe(clientUserId);
    expect(row.metadata.actor_role).toBe('superadmin');
  });

  test('cliente ve SUS accesos en /audit/access (RGPD transparency)', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/audit/access`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: Array<{
        action: string;
        resource: string | null;
        metadata: Record<string, unknown> | null;
      }>;
      meta: { total: number };
    };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    // Todas las filas devueltas pertenecen al cliente.
    for (const entry of body.data) {
      expect(
        (entry.metadata as Record<string, unknown> | null)?.target_user_id,
      ).toBe(clientUserId);
    }
  });

  test('otro cliente NO ve los accesos del primero (ownership filter)', async ({
    request,
  }) => {
    const other = await createClientAndLogin(request, 'audit-other');

    const res = await request.get(`${TEST_CONFIG.apiUrl}/audit/access`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[] };
    // El otro cliente NO tiene accesos a sus datos todavía → vacío.
    expect(body.data.length).toBe(0);
  });

  test('cliente lee SU PROPIA factura → NO genera fila de audit (es su derecho natural)', async ({
    request,
  }) => {
    // Limpia y verifica antes.
    await pool.query(
      `DELETE FROM audit_access_log
       WHERE metadata->>'target_user_id' = $1`,
      [clientUserId],
    );

    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/billing/invoices/${invoiceId}`,
      { headers: { Authorization: `Bearer ${clientToken}` } },
    );
    expect(res.ok()).toBeTruthy();

    await new Promise((r) => setTimeout(r, 300));

    const rows = await pool.query(
      `SELECT id FROM audit_access_log
       WHERE metadata->>'target_user_id' = $1`,
      [clientUserId],
    );
    expect(rows.rowCount).toBe(0);
  });
});

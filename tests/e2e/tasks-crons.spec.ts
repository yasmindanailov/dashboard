/**
 * E2E — Sprint 8 Fase C (2026-05-01) — crons de tareas + maintenance crítico.
 *
 * Cubre el flujo end-to-end completo de los 3 crons nuevos disparándolos
 * manualmente vía `POST /admin/tasks/cron/:name` (mismo punto de entrada
 * que usa el smoke test del operador):
 *
 *   1. **task.overdue** — crear task con asignado, envejecerla en BD,
 *      disparar cron, verificar status=`not_completed_in_time` + email
 *      al agente + notification interna.
 *   2. **task.unassigned_overdue** (ADR-072) — crear task en cola pública,
 *      envejecerla por SLA, disparar cron, verificar email al superadmin
 *      + notification interna.
 *   3. **maintenance.critical** sin candidatos — confirma degradación
 *      elegante (cron devuelve total=0 cuando no hay services con
 *      checklist contratado, doctrina Sprint 8 Fase C: Fase D introduce
 *      service_checklist_items).
 *   4. **defense in depth** — cliente recibe 403 al intentar disparar el
 *      cron (AdminOnlyGuard + Manage.Job, ADR-067 §4).
 *
 * Patrón heredado de `tasks.spec.ts` y `notifications.spec.ts`: API-only
 * para evitar flakes de UI WIP. Usa MailPit para verificar email.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';
import { insertTask } from './fixtures/tasks';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const CLIENT_PASSWORD = 'TestPassword123!';

let pool: Pool;
let agentSupportId: string;
let clientUserId: string;

async function loginSuperadminAPI(request: APIRequestContext): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginBody = (await loginRes.json()) as {
    requires_2fa?: boolean;
    temp_token?: string;
    access_token?: string;
  };
  if (loginBody.access_token) return loginBody.access_token;
  if (!loginBody.temp_token) {
    throw new Error('Login response sin access_token ni temp_token');
  }
  const codeMail = await waitForEmail(TEST_CONFIG.superadmin.email, {
    subjectIncludes: 'código',
    timeoutMs: 15_000,
  });
  const code = extract2FACode(codeMail);
  const verifyRes = await request.post(
    `${TEST_CONFIG.apiUrl}/auth/verify-2fa`,
    { data: { temp_token: loginBody.temp_token, code } },
  );
  expect(verifyRes.ok()).toBeTruthy();
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

async function loginClientAPI(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password: CLIENT_PASSWORD },
  });
  expect(
    loginRes.ok(),
    `Login cliente falló: ${loginRes.status()} ${await loginRes.text()}`,
  ).toBeTruthy();
  const body = (await loginRes.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('Cliente sin 2FA pero no llegó access_token');
  }
  return body.access_token;
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
  const passwordHash = await bcrypt.hash(CLIENT_PASSWORD, 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [opts.email, passwordHash, opts.firstName, opts.lastName, roleId],
  );
  return res.rows[0].id as string;
}

async function authedRequest(
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

test.describe('Tasks crons — Sprint 8 Fase C', () => {
  let superadminToken: string;
  let superadminId: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    agentSupportId = await createUser({
      email: 'e2e-cron-agent@aelium.test',
      firstName: 'Sara',
      lastName: 'Cron',
      roleSlug: 'agent_support',
    });
    clientUserId = await createUser({
      email: 'e2e-cron-client@aelium.test',
      firstName: 'Cliente',
      lastName: 'Cron',
      roleSlug: 'client',
    });
    superadminToken = await loginSuperadminAPI(request);
    const sa = await pool.query(`SELECT id FROM users WHERE email = $1`, [
      TEST_CONFIG.superadmin.email,
    ]);
    superadminId = sa.rows[0].id as string;
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('cron `overdue`: tarea con asignado vencida >7d → not_completed_in_time + email + notification', async ({
    request,
  }) => {
    await clearMailbox();

    // Sprint 16 (ADR-079): insertamos la task vía SQL (las tasks ya no
    // se crean por API). due_date = hace 10 días supera el threshold
    // default 7 días.
    const taskId = await insertTask(pool, {
      source_system: 'support_inside_slot',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
      due_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    // Disparar el cron manualmente.
    const cronRes = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/tasks/cron/overdue',
    );
    expect(
      cronRes.ok(),
      `Cron run falló: ${cronRes.status()} ${await cronRes.text()}`,
    ).toBeTruthy();
    const cronBody = (await cronRes.json()) as {
      cron: string;
      result: { processed: number; threshold_days: number };
    };
    expect(cronBody.cron).toBe('overdue');
    expect(cronBody.result.processed).toBeGreaterThanOrEqual(1);
    expect(cronBody.result.threshold_days).toBe(7);

    // Verificar status terminal en DB.
    const statusRes = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(statusRes.rows[0].status).toBe('not_completed_in_time');

    // Email "Tarea vencida" al agente.
    const email = await waitForEmail('e2e-cron-agent@aelium.test', {
      subjectIncludes: 'Tarea vencida',
      timeoutMs: 15_000,
    });
    expect(email.Subject).toMatch(/Tarea vencida/i);

    // Notification interna persistida con action_url canónica.
    const notifs = await pool.query(
      `SELECT action_url, metadata FROM notifications
       WHERE user_id = $1 AND channel = 'internal'
         AND metadata->>'event' = 'task.overdue'
       ORDER BY created_at DESC LIMIT 1`,
      [agentSupportId],
    );
    expect(notifs.rowCount).toBe(1);
    // ADR-079 + Sprint 13 §13.AUTH §11.1 B7: el frontend NO tiene
    // `/admin/tasks/[id]`. Para tasks no-bridge la URL canónica es la
    // lista `/admin/tasks` (filtros + modal). Bridge `support_ticket`
    // apunta al ticket; aquí source_system='support_inside_slot'.
    expect(notifs.rows[0].action_url).toBe('/admin/tasks');
  });

  test('cron `unassigned-overdue`: cola pública fuera de SLA → email + notification al superadmin (ADR-072)', async ({
    request,
  }) => {
    // Sprint 16 (ADR-079): insertamos vía SQL. Settings key `tasks.unassigned_sla_hours.default`
    // tiene fallback 24h — created_at = hace 36h supera default.
    await insertTask(pool, {
      source_system: 'provisioning_manual',
      client_id: clientUserId,
      assigned_to: null, // cola pública
      priority: 'high',
      created_at: new Date(Date.now() - 36 * 60 * 60 * 1000),
    });

    await clearMailbox();

    // 3. Disparar cron.
    const cronRes = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/tasks/cron/unassigned-overdue',
    );
    expect(cronRes.ok()).toBeTruthy();
    const cronBody = (await cronRes.json()) as {
      cron: string;
      result: { total: number; oldest_age_hours: number };
    };
    expect(cronBody.cron).toBe('unassigned-overdue');
    expect(cronBody.result.total).toBeGreaterThanOrEqual(1);
    expect(cronBody.result.oldest_age_hours).toBeGreaterThanOrEqual(24);

    // 4. Email al superadmin.
    const email = await waitForEmail(TEST_CONFIG.superadmin.email, {
      subjectIncludes: 'sin asignar fuera de SLA',
      timeoutMs: 15_000,
    });
    expect(email.Subject).toContain('Aelium');

    // 5. Notification interna superadmin.
    const notifs = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND channel = 'internal'
         AND metadata->>'event' = 'task.unassigned_overdue'
       ORDER BY created_at DESC LIMIT 1`,
      [superadminId],
    );
    expect(notifs.rowCount).toBe(1);
  });

  test('cron `maintenance-critical`: sin services con checklist → total=0 (degradación elegante Fase D pendiente)', async ({
    request,
  }) => {
    const cronRes = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/tasks/cron/maintenance-critical',
    );
    expect(cronRes.ok()).toBeTruthy();
    const cronBody = (await cronRes.json()) as {
      cron: string;
      result: { total: number; threshold_days: number };
    };
    expect(cronBody.cron).toBe('maintenance-critical');
    expect(cronBody.result.total).toBe(0);
    expect(cronBody.result.threshold_days).toBe(60);
  });

  test('endpoint admin rechaza nombres inválidos con 400', async ({ request }) => {
    const res = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/tasks/cron/foo-bar',
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Cron desconocido/);
  });

  test('cliente recibe 403 al intentar disparar el cron (defense in depth: AdminOnlyGuard)', async ({
    request,
  }) => {
    const clientToken = await loginClientAPI(
      request,
      'e2e-cron-client@aelium.test',
    );
    const res = await authedRequest(
      request,
      clientToken,
      'POST',
      '/admin/tasks/cron/overdue',
    );
    expect(res.status()).toBe(403);
  });
});

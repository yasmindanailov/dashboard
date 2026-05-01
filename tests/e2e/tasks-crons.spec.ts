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

    // 1. Crear tarea con due_date HOY (la API rechaza fechas pasadas por
    //    EC-T8-12). Asignamos al agente.
    const today = new Date();
    today.setUTCHours(23, 59, 0, 0);
    const createRes = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/tasks',
      {
        type: 'maintenance',
        title: 'Tarea vieja para cron overdue (E2E)',
        priority: 'medium',
        client_id: clientUserId,
        assigned_to: agentSupportId,
        due_date: today.toISOString(),
      },
    );
    expect(
      createRes.ok(),
      `Create falló: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    const created = (await createRes.json()) as { id: string };

    // 2. Envejecer la tarea: due_date = hace 10 días (supera el threshold
    //    default 7 días). Patch directo en DB para saltarse EC-T8-12.
    await pool.query(
      `UPDATE tasks SET due_date = NOW() - INTERVAL '10 days' WHERE id = $1`,
      [created.id],
    );

    // Limpiamos mailbox para no contar el email task.assigned.
    await clearMailbox();

    // 3. Disparar el cron manualmente.
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

    // 4. Verificar status terminal en DB.
    const statusRes = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [created.id],
    );
    expect(statusRes.rows[0].status).toBe('not_completed_in_time');

    // 5. Email "Tarea vencida" al agente.
    const email = await waitForEmail('e2e-cron-agent@aelium.test', {
      subjectIncludes: 'Tarea vencida',
      timeoutMs: 15_000,
    });
    expect(email.Subject).toContain('Tarea vieja para cron overdue');

    // 6. Notification interna persistida.
    const notifs = await pool.query(
      `SELECT title, action_url, metadata FROM notifications
       WHERE user_id = $1 AND channel = 'internal'
         AND metadata->>'event' = 'task.overdue'
       ORDER BY created_at DESC LIMIT 1`,
      [agentSupportId],
    );
    expect(notifs.rowCount).toBe(1);
    expect(notifs.rows[0].title as string).toContain(
      'Tarea vieja para cron overdue',
    );
    expect(notifs.rows[0].action_url).toBe(`/admin/tasks/${created.id}`);
  });

  test('cron `unassigned-overdue`: cola pública fuera de SLA → email + notification al superadmin (ADR-072)', async ({
    request,
  }) => {
    // 1. Crear tarea SIN asignado (ADR-072 cola pública).
    const today = new Date();
    today.setUTCHours(23, 59, 0, 0);
    const createRes = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/tasks',
      {
        type: 'support_setup', // SLA default 4h
        title: 'Setup pendiente de tomar (E2E)',
        priority: 'high',
        client_id: clientUserId,
        due_date: today.toISOString(),
        // assigned_to omitido → cola pública.
      },
    );
    expect(
      createRes.ok(),
      `Create unassigned falló: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    const created = (await createRes.json()) as {
      id: string;
      assigned_to: string | null;
    };
    expect(created.assigned_to).toBeNull();

    // 2. Envejecer la tarea: created_at = hace 12h (supera SLA support_setup 4h).
    await pool.query(
      `UPDATE tasks SET created_at = NOW() - INTERVAL '12 hours' WHERE id = $1`,
      [created.id],
    );

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
    expect(cronBody.result.oldest_age_hours).toBeGreaterThanOrEqual(12);

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

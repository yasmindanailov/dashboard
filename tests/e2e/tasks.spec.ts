/**
 * E2E — Cierre Sprint 8 mínimo (P0.1).
 *
 * Cubre los 3 puntos de docs/60-roadmap/current.md §Sprint 8 acciones prioritarias:
 *   1. Listener `task.assigned` → email al agente (verificado vía MailPit)
 *      y notificación interna (verificada en DB).
 *   2. Validación FK `assigned_to`: 400 si user inexistente o sin rol agent_*.
 *   3. Flujo completo: admin crea → asigna → agente la ve → la completa.
 *
 * Enfoque API: estable y rápido. La UI de tasks tiene copy en evolución
 * (Sprint 8 Fase B WIP), validarla aquí generaría flakes.
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
let agentSupportId: string;
let agentBillingId: string;
let clientUserId: string;

/**
 * Login del superadmin via API gestionando el step de 2FA.
 * El email del 2FA llega a MailPit y lo extraemos automáticamente.
 * Retorna el access_token de sesión completa.
 */
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
  expect(
    verifyRes.ok(),
    `verify-2fa falló: ${verifyRes.status()} ${await verifyRes.text()}`,
  ).toBeTruthy();
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

async function getRoleId(slug: string): Promise<string> {
  const res = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (!res.rows[0]) throw new Error(`Role ${slug} not found`);
  return res.rows[0].id;
}

async function createUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
}): Promise<string> {
  const roleId = await getRoleId(opts.roleSlug);
  const passwordHash = await bcrypt.hash('TestPassword123!', 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [opts.email, passwordHash, opts.firstName, opts.lastName, roleId],
  );
  return res.rows[0].id;
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

test.describe('Tasks — cierre Sprint 8 (P0.1)', () => {
  let sharedToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    agentSupportId = await createUser({
      email: 'e2e-agent-support@aelium.test',
      firstName: 'Sara',
      lastName: 'Soporte',
      roleSlug: 'agent_support',
    });
    agentBillingId = await createUser({
      email: 'e2e-agent-billing@aelium.test',
      firstName: 'Bruno',
      lastName: 'Billing',
      roleSlug: 'agent_billing',
    });
    clientUserId = await createUser({
      email: 'e2e-client@aelium.test',
      firstName: 'Carla',
      lastName: 'Cliente',
      roleSlug: 'client',
    });

    // Una única sesión 2FA compartida — evita race conditions sobre
    // user.two_factor_secret y mantiene el suite < 30s.
    sharedToken = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('admin crea tarea asignada → agente recibe email + notification, completa OK', async ({
    request,
  }) => {
    await clearMailbox();
    const accessToken = sharedToken;

    // 1. Crear tarea asignada al agent_support
    const createRes = await authedRequest(request, accessToken, 'POST', '/tasks', {
      type: 'wow_call',
      title: 'WOW call cliente nuevo (E2E)',
      description: 'Verificar onboarding y resolver dudas iniciales',
      priority: 'high',
      client_id: clientUserId,
      assigned_to: agentSupportId,
    });
    expect(
      createRes.ok(),
      `Create falló: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    const created = (await createRes.json()) as {
      id: string;
      assigned_to: string;
      status: string;
    };
    expect(created.assigned_to).toBe(agentSupportId);
    expect(created.status).toBe('pending');

    // 2. Email al agente vía listener task.assigned
    const email = await waitForEmail('e2e-agent-support@aelium.test', {
      subjectIncludes: 'tarea asignada',
      timeoutMs: 15_000,
    });
    expect(email.Subject).toContain('WOW call cliente nuevo');

    // 3. Notification interna persistida
    const notifs = await pool.query(
      `SELECT title, action_url, metadata FROM notifications
       WHERE user_id = $1 AND channel = 'internal'
       ORDER BY created_at DESC LIMIT 1`,
      [agentSupportId],
    );
    expect(notifs.rowCount).toBe(1);
    expect(notifs.rows[0].title).toContain('WOW call cliente nuevo');
    // Sprint 8 Fase B.1.bis (2026-04-29): tasks viven en `/admin/tasks/*`
    // (ADR-066 + DC.7); el listener `tasks-email.listener.ts` ahora emite
    // `action_url` apuntando al portal staff. URL legacy `/dashboard/tasks/`
    // quedaba huérfana tras Sprint 9.6 — fix portal incluido en la sesión
    // 8.B.1 + bugfix detection by Yasmin.
    expect(notifs.rows[0].action_url).toBe(`/admin/tasks/${created.id}`);
    expect(notifs.rows[0].metadata?.event).toBe('task.assigned');

    // 4. Reasignar al agent_billing → otra notification
    await clearMailbox();
    const updateRes = await authedRequest(
      request,
      accessToken,
      'PATCH',
      `/tasks/${created.id}`,
      { assigned_to: agentBillingId },
    );
    expect(updateRes.ok()).toBeTruthy();

    await waitForEmail('e2e-agent-billing@aelium.test', {
      subjectIncludes: 'tarea asignada',
      timeoutMs: 15_000,
    });

    const notifs2 = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [agentBillingId],
    );
    expect(notifs2.rowCount).toBe(1);

    // 5. Completar tarea
    const completeRes = await authedRequest(
      request,
      accessToken,
      'PATCH',
      `/tasks/${created.id}/complete`,
      { internal_notes: 'Todo OK, cliente satisfecho' },
    );
    expect(completeRes.ok()).toBeTruthy();
    const completed = (await completeRes.json()) as { status: string };
    expect(completed.status).toBe('completed');
  });

  test('crear tarea con assigned_to inexistente devuelve 400', async ({
    request,
  }) => {
    const accessToken = sharedToken;

    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await authedRequest(request, accessToken, 'POST', '/tasks', {
      type: 'maintenance',
      title: 'Tarea con asignado inválido',
      priority: 'low',
      client_id: clientUserId,
      assigned_to: fakeUuid,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/no existe/i);
  });

  test('crear tarea con assigned_to = client (rol no agente) devuelve 400', async ({
    request,
  }) => {
    const accessToken = sharedToken;

    const res = await authedRequest(request, accessToken, 'POST', '/tasks', {
      type: 'maintenance',
      title: 'Tarea asignada a cliente (debe rechazar)',
      priority: 'low',
      client_id: clientUserId,
      assigned_to: clientUserId,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/admins o agentes/i);
  });
});

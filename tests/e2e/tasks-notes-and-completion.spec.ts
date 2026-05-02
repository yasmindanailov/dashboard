/**
 * E2E — Notes + completion canónico Sprint 16 (ADR-079 §3.9).
 *
 * Cubre la doctrina nueva:
 *   - La creación de nota es atómica con `PATCH /tasks/:id/complete`. NO
 *     hay endpoint POST /tasks/:id/notes para crear notas inline durante
 *     la ejecución (ese flujo se eliminó por ADR-079 §3.8).
 *   - Completar `client_lifecycle` / `provisioning_manual` / `project`
 *     EXIGE `note` obligatoria en el body — sin ella → 400.
 *   - GET /tasks/:id/notes lista las notas con source_system='task_completion'
 *     vinculadas a la task (read-only — para timeline en card detalle).
 *   - Listener `task.completed` notifica al cliente para tasks no-bridge
 *     (excepto support_ticket y support_inside_slot que tienen su propio
 *     canal canónico).
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
import { insertTask } from './fixtures/tasks';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;
let clientUserId: string;
let clientEmail: string;
let agentSupportId: string;

async function login2FA(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error(`${email}: no token`);
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
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

async function loginSuperadmin(request: APIRequestContext): Promise<string> {
  return login2FA(request, TEST_CONFIG.superadmin.email, SUPERADMIN_PASSWORD);
}

async function createUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
  password?: string;
}): Promise<string> {
  const roleRes = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [
    opts.roleSlug,
  ]);
  const roleId = roleRes.rows[0].id as string;
  const passwordHash = await bcrypt.hash(opts.password ?? 'TestPassword123!', 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [opts.email, passwordHash, opts.firstName, opts.lastName, roleId],
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

test.describe('Tasks — notes + completion canónico Sprint 16 (ADR-079)', () => {
  let superadminToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    clientEmail = 'e2e-b9-client@aelium.test';
    clientUserId = await createUser({
      email: clientEmail,
      firstName: 'Carla',
      lastName: 'B9',
      roleSlug: 'client',
    });
    agentSupportId = await createUser({
      email: 'e2e-b9-agent@aelium.test',
      firstName: 'Sara',
      lastName: 'B9',
      roleSlug: 'agent_support',
    });

    superadminToken = await loginSuperadmin(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('completar client_lifecycle con `note` → ClientNote canónica + email cliente', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    await clearMailbox();
    const completeRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      {
        note:
          'Hemos hablado con el cliente y resuelto sus dudas iniciales del onboarding.',
      },
    );
    expect(
      completeRes.ok(),
      `complete: ${completeRes.status()} ${await completeRes.text()}`,
    ).toBeTruthy();

    // ClientNote canónica con source_system + categoría inferida.
    const noteRes = await pool.query(
      `SELECT category, source_system, source_id, triggered_by_action, body
       FROM client_notes
       WHERE user_id = $1 AND source_system = 'task_completion' AND source_id = $2`,
      [clientUserId, taskId],
    );
    expect(noteRes.rowCount).toBe(1);
    expect(noteRes.rows[0].category).toBe('onboarding');
    expect(noteRes.rows[0].triggered_by_action).toBe('task.completed');

    // Email al cliente vía listener task.completed (excepto bridges).
    const email = await waitForEmail(clientEmail, {
      subjectIncludes: 'solicitud',
      timeoutMs: 15_000,
    });
    expect(email).toBeTruthy();
  });

  test('completar SIN `note` → 400 (la nota es obligatoria por ADR-079 §3.9)', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'provisioning_manual',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    const res = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      {},
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message.toLowerCase()).toMatch(/nota|obligator/);
  });

  test('GET /tasks/:id/notes lista notas vinculadas (post-completion)', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'project',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      { note: 'Item del checklist resuelto en sprint actual.' },
    );

    const listRes = await authed(
      request,
      superadminToken,
      'GET',
      `/tasks/${taskId}/notes`,
    );
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as Array<{
      body: string;
      author: { first_name: string };
    }>;
    expect(list).toHaveLength(1);
    expect(list[0].body).toContain('checklist resuelto');
    expect(list[0].author.first_name).toBeTruthy();
  });
});

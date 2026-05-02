/**
 * E2E — Tasks detail + notes shape (Sprint 16 Fase 16.B / ADR-079).
 *
 * Sprint 16 cambió la doctrina:
 *  - GET /tasks/:id ya NO trae enrichment de service+product (la doctrina
 *    ADR-079 §3.6 establece que el "qué hay que hacer" vive en el sistema
 *    vinculado y se renderiza dinámicamente — la card consulta on-demand).
 *  - ClientNote ya NO trae `task_title`/`task_type` enriched: cuando una
 *    nota viene de cierre de task, vive con `source_system='task_completion'`
 *    + `source_id=task.id` y la UI navega al sistema vinculado para ver el
 *    contexto vivo.
 *  - Endpoint POST /admin/clients/:id/structured-notes ahora crea
 *    `source_system='exceptional'` (única vía pública de creación libre).
 *
 * Este spec valida el SHAPE canónico nuevo. Tests anteriores (B.2/B.4)
 * eliminados porque sus features quedaron superseded por ADR-079.
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

let pool: Pool;
let agentSupportId: string;
let clientUserId: string;

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

test.describe('Tasks — shape canónico Sprint 16 (ADR-079)', () => {
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
    token = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('GET /tasks/:id devuelve shape canónico (source_system + source_id + sin title/type/description)', async ({
    request,
  }) => {
    // En `client_lifecycle` la doctrina es source_id=client.id (ADR-079 §2).
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      source_id: clientUserId,
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    const detailRes = await authed(request, token, 'GET', `/tasks/${taskId}`);
    expect(detailRes.ok()).toBeTruthy();
    const task = (await detailRes.json()) as Record<string, unknown>;

    // Shape canónico ADR-079 §3.1.
    expect(task.source_system).toBe('client_lifecycle');
    expect(task.source_id).toBe(clientUserId);
    expect(task.client_id).toBe(clientUserId);
    expect(task.assigned_to).toBe(agentSupportId);
    expect(task.status).toBe('pending');

    // Campos ELIMINADOS por ADR-079: no deben aparecer en el shape.
    expect(task.title).toBeUndefined();
    expect(task.type).toBeUndefined();
    expect(task.description).toBeUndefined();
    expect(task.client_note).toBeUndefined();
    expect(task.is_recurring).toBeUndefined();
    expect(task.billing_month).toBeUndefined();
    expect(task.reason).toBeUndefined();
    expect(task.metadata).toBeUndefined();
    expect(task.service_id).toBeUndefined();
    expect(task.conversation_id).toBeUndefined();

    // Relations canónicas presentes.
    expect((task.assignee as Record<string, unknown>)?.id).toBe(agentSupportId);
    expect((task.client as Record<string, unknown>)?.id).toBe(clientUserId);
  });

  test('completar task → ClientNote canónica con source_system=task_completion + source_id=task.id', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    const completeRes = await authed(
      request,
      token,
      'PATCH',
      `/tasks/${taskId}/complete`,
      {
        note: 'Llamada de bienvenida realizada — cliente recibió onboarding OK.',
      },
    );
    expect(completeRes.ok()).toBeTruthy();

    // Nota canónica creada con source tracking — categoría 'onboarding' por
    // mapping `client_lifecycle → onboarding` (ADR-079 §3.9).
    const noteRes = await pool.query(
      `SELECT category, source_system, source_id, triggered_by_action, body
       FROM client_notes
       WHERE user_id = $1 AND source_system = 'task_completion' AND source_id = $2`,
      [clientUserId, taskId],
    );
    expect(noteRes.rowCount).toBe(1);
    expect(noteRes.rows[0].category).toBe('onboarding');
    expect(noteRes.rows[0].triggered_by_action).toBe('task.completed');
    expect(noteRes.rows[0].body).toContain('Llamada de bienvenida');
  });

  test('POST /admin/clients/:id/structured-notes crea nota excepcional (source_system=exceptional)', async ({
    request,
  }) => {
    const createRes = await authed(
      request,
      token,
      'POST',
      `/admin/clients/${clientUserId}/structured-notes`,
      {
        body: 'Nota libre del agente desde perfil del cliente.',
        is_pinned: true,
      },
    );
    expect(
      createRes.ok(),
      `create exceptional: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();

    const listRes = await authed(
      request,
      token,
      'GET',
      `/admin/clients/${clientUserId}/structured-notes?source_system=exceptional`,
    );
    const body = (await listRes.json()) as {
      data: Array<{
        body: string;
        category: string;
        source_system: string;
        triggered_by_action: string;
        is_pinned: boolean;
      }>;
    };
    const note = body.data.find((n) => n.body.includes('Nota libre'));
    expect(note).toBeDefined();
    expect(note?.category).toBe('exceptional');
    expect(note?.source_system).toBe('exceptional');
    expect(note?.triggered_by_action).toBe('manual_entry');
    expect(note?.is_pinned).toBe(true);
  });
});

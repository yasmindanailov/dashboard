/**
 * E2E — Tasks API canónica (Sprint 16 Fase 16.B / ADR-079).
 *
 * Sprint 16 cierra `POST /tasks` (creación manual) por doctrina ADR-079 §1:
 * las tasks vienen siempre de uno de los 5 source_systems automáticos. Este
 * spec valida los flujos canónicos:
 *
 *   1. Trigger ticket → SupportTicketTaskCreatorListener crea task bridge.
 *      Email + notification al agente. Reasignación a otro agente. Cierre
 *      vía /complete-ticket-bridge.
 *   2. Auto-asignación desde cola pública (PATCH /assign con
 *      assigned_to=current_user — tarea seedeada con assigned_to=null).
 *   3. Validación CASL: agente no puede reasignar tarea ajena.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';
import { insertTask, findActiveTaskBySource } from './fixtures/tasks';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;
let agentSupportId: string;
let agentBillingId: string;
let clientUserId: string;

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

async function createTicketAndAssign(opts: {
  request: APIRequestContext;
  token: string;
  clientId: string;
  agentId: string;
  subject: string;
}): Promise<string> {
  // 1. Insertar conversación tipo ticket directamente en BD (más simple
  //    que crear via API support con sus validaciones de canal/permisos
  //    — el contrato del bridge solo necesita un ticket existente).
  const convRes = await pool.query(
    `INSERT INTO conversations (type, user_id, subject, priority, channel, status)
     VALUES ('ticket', $1, $2, 'high'::"ConversationPriority", 'web', 'open')
     RETURNING id`,
    [opts.clientId, opts.subject],
  );
  const conversationId = convRes.rows[0].id as string;

  // 2. Asignar agente vía API canónica /support/conversations/:id —
  //    dispara `conversation.assigned` → SupportTicketTaskCreatorListener
  //    crea task bridge.
  const assignRes = await authedRequest(
    opts.request,
    opts.token,
    'PATCH',
    `/support/conversations/${conversationId}`,
    { assigned_agent_id: opts.agentId },
  );
  expect(
    assignRes.ok(),
    `assign conversation: ${assignRes.status()} ${await assignRes.text()}`,
  ).toBeTruthy();

  return conversationId;
}

test.describe.configure({ mode: 'serial' });

test.describe('Tasks — API canónica Sprint 16 (ADR-079)', () => {
  let sharedToken: string;
  let agentSupportToken: string;

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

    sharedToken = await loginSuperadminAPI(request);
    // Login del agent una sola vez (2FA por email — evita race conditions
    // con MailPit cuando varios tests intentan hacer login concurrente).
    agentSupportToken = await loginAgent2FA(
      request,
      'e2e-agent-support@aelium.test',
    );
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('trigger ticket → task bridge → email + notification al agente → completar via bridge', async ({
    request,
  }) => {
    await clearMailbox();

    // 1. Crear ticket + asignar agente → trigger crea task.
    const conversationId = await createTicketAndAssign({
      request,
      token: sharedToken,
      clientId: clientUserId,
      agentId: agentSupportId,
      subject: 'Ticket E2E Sprint 16',
    });

    // 2. Esperar a que el listener cree la task (es async via EventEmitter2;
    //    poll breve).
    let task: Record<string, unknown> | null = null;
    for (let i = 0; i < 20; i++) {
      task = await findActiveTaskBySource(
        pool,
        'support_ticket',
        conversationId,
      );
      if (task) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(task, 'task bridge support_ticket no se creó').not.toBeNull();
    expect(task!.assigned_to).toBe(agentSupportId);
    expect(task!.client_id).toBe(clientUserId);
    expect(task!.priority).toBe('medium'); // sin SI → medium (ADR-079 §3.3)

    // 3. Email al agente vía listener task.assigned + notification interna.
    await waitForEmail('e2e-agent-support@aelium.test', {
      subjectIncludes: 'tarea',
      timeoutMs: 15_000,
    });
    const notifs = await pool.query(
      `SELECT action_url, metadata FROM notifications
       WHERE user_id = $1 AND channel = 'internal'
       ORDER BY created_at DESC LIMIT 1`,
      [agentSupportId],
    );
    expect(notifs.rowCount).toBe(1);
    // ADR-079 + Sprint 13 §13.AUTH §11.1 B7: bridge `support_ticket`
    // apunta al ticket (fuente de verdad), NO a la task. La página
    // `/admin/tasks/[id]` no existe.
    expect(notifs.rows[0].action_url).toBe(`/admin/support/${conversationId}`);
    expect(notifs.rows[0].metadata?.event).toBe('task.assigned');

    // 4. Reasignar al agent_billing via PATCH /tasks/:id/assign.
    await clearMailbox();
    const assignRes = await authedRequest(
      request,
      sharedToken,
      'PATCH',
      `/tasks/${task!.id}/assign`,
      { assigned_to: agentBillingId },
    );
    expect(
      assignRes.ok(),
      `reassign: ${assignRes.status()} ${await assignRes.text()}`,
    ).toBeTruthy();
    await waitForEmail('e2e-agent-billing@aelium.test', {
      subjectIncludes: 'tarea',
      timeoutMs: 15_000,
    });

    // 5. Completar via bridge — delega en support para resolver ticket.
    const completeRes = await authedRequest(
      request,
      sharedToken,
      'PATCH',
      `/tasks/${task!.id}/complete-ticket-bridge`,
      {
        ticket_action: 'resolve',
        resolution_note:
          'Resolución E2E: incidencia atendida y verificada con cliente.',
      },
    );
    expect(
      completeRes.ok(),
      `complete-ticket-bridge: ${completeRes.status()} ${await completeRes.text()}`,
    ).toBeTruthy();
    const completed = (await completeRes.json()) as {
      status: string;
      completed_by: string;
    };
    expect(completed.status).toBe('completed');
    expect(completed.completed_by).toBeTruthy();

    // 6. ClientNote canónica creada en module support con source_system='ticket'.
    const noteRes = await pool.query(
      `SELECT body, source_system, triggered_by_action, category
       FROM client_notes
       WHERE user_id = $1 AND source_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [clientUserId, conversationId],
    );
    expect(noteRes.rowCount).toBe(1);
    expect(noteRes.rows[0].source_system).toBe('ticket');
    expect(noteRes.rows[0].triggered_by_action).toBe('ticket.resolved');
    expect(noteRes.rows[0].category).toBe('support');
  });

  test('auto-asignación desde cola pública: PATCH /assign con assigned_to=current_user', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: null,
      priority: 'medium',
    });

    const claimRes = await authedRequest(
      request,
      agentSupportToken,
      'PATCH',
      `/tasks/${taskId}/assign`,
      { assigned_to: agentSupportId },
    );
    expect(
      claimRes.ok(),
      `claim from pool: ${claimRes.status()} ${await claimRes.text()}`,
    ).toBeTruthy();
    const claimed = (await claimRes.json()) as {
      assigned_to: string;
      status: string;
    };
    expect(claimed.assigned_to).toBe(agentSupportId);
    expect(claimed.status).toBe('in_progress');
  });

  test('agente no admin no puede reasignar tarea de OTRO agente', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'provisioning_manual',
      client_id: clientUserId,
      assigned_to: agentBillingId,
      priority: 'medium',
    });

    const res = await authedRequest(
      request,
      agentSupportToken,
      'PATCH',
      `/tasks/${taskId}/assign`,
      { assigned_to: agentSupportId },
    );
    expect(res.status()).toBe(403);
  });
});

/**
 * Login de agente con 2FA automático (los agentes nacen con 2FA si así lo
 * exige el seed/config). Reusa el helper canónico para no duplicar.
 */
async function loginAgent2FA(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password: 'TestPassword123!' },
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

/**
 * E2E — Tasks ↔ Tickets bridge canónico Sprint 16 (ADR-079 §2 trigger #1).
 *
 * Cubre el bridge ticket↔task con la API canónica nueva:
 *
 *   1. Asignar agente a ticket → SupportTicketTaskCreatorListener crea
 *      Task(source_system='support_ticket', source_id=conversation_id).
 *   2. Reasignar el ticket → la task existente se reasigna (no duplica
 *      gracias al UNIQUE INDEX parcial canónico).
 *   3. Completar bridge vía /tasks/:id/complete-ticket-bridge con
 *      ticket_action='resolve' → ticket pasa a `resolved` + ClientNote
 *      canónica (source_system='ticket' + triggered_by_action='ticket.resolved').
 *   4. Completar bridge sin resolution_note → 400.
 *   5. Completar bridge con ticket_action='close' → ticket `closed`.
 *   6. Cancelar task bridge vía /tasks/:id/cancel → ticket queda
 *      sin asignar pero abierto (assigned_agent_id=null).
 *   7. Desasignar ticket cancela la task bridge activa.
 *   8. Reabrir ticket regenera task bridge nueva.
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
let clientUserId: string;
let agentSupportId: string;
let agentBillingId: string;

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

async function createTicketInDb(
  userId: string,
  subject: string,
  priority = 'normal',
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO conversations (type, user_id, subject, priority, channel, status)
     VALUES ('ticket', $1, $2, $3::"ConversationPriority", 'web', 'open')
     RETURNING id`,
    [userId, subject, priority],
  );
  return res.rows[0].id as string;
}

/**
 * Espera a que el listener canónico haya creado/actualizado la task bridge
 * para un ticket. Devuelve la task activa o null tras timeout.
 */
async function waitForActiveBridgeTask(
  ticketId: string,
  predicate: (row: {
    id: string;
    source_system: string;
    assigned_to: string | null;
    status: string;
  }) => boolean,
  timeoutMs = 5_000,
): Promise<{
  id: string;
  source_system: string;
  assigned_to: string | null;
  status: string;
} | null> {
  const tries = Math.ceil(timeoutMs / 250);
  for (let i = 0; i < tries; i++) {
    const r = await pool.query(
      `SELECT id, source_system, assigned_to, status FROM tasks
       WHERE source_system = 'support_ticket' AND source_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [ticketId],
    );
    if (r.rowCount && r.rowCount > 0) {
      const row = r.rows[0] as {
        id: string;
        source_system: string;
        assigned_to: string | null;
        status: string;
      };
      if (predicate(row)) return row;
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  return null;
}

test.describe.configure({ mode: 'serial' });

test.describe('Tasks ↔ Tickets bridge — Sprint 16 (ADR-079)', () => {
  let superadminToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    clientUserId = await createUser({
      email: 'e2e-b10-client@aelium.test',
      firstName: 'Carla',
      lastName: 'B10',
      roleSlug: 'client',
    });
    agentSupportId = await createUser({
      email: 'e2e-b10-support@aelium.test',
      firstName: 'Susana',
      lastName: 'B10',
      roleSlug: 'agent_support',
    });
    agentBillingId = await createUser({
      email: 'e2e-b10-billing@aelium.test',
      firstName: 'Bruno',
      lastName: 'B10',
      roleSlug: 'agent_full',
    });

    superadminToken = await loginSuperadmin(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('asignar agente a ticket → crea task bridge canónica', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: problema hosting',
      'high',
    );

    const assignRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    expect(assignRes.ok()).toBeTruthy();

    const task = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );
    expect(task).not.toBeNull();
    expect(task!.source_system).toBe('support_ticket');
    expect(task!.assigned_to).toBe(agentSupportId);
    expect(task!.status).toBe('pending');
  });

  test('reasignar ticket → reasigna la task existente sin duplicar', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: reasignación',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentBillingId },
    );

    const final = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentBillingId,
    );
    expect(final).not.toBeNull();

    // 1 sola task activa para ese ticket (no duplicada).
    const count = await pool.query(
      `SELECT count(*)::int AS cnt FROM tasks
       WHERE source_system = 'support_ticket' AND source_id = $1
         AND status IN ('pending','in_progress')`,
      [ticketId],
    );
    expect(count.rows[0].cnt).toBe(1);
  });

  test('completar bridge resolve → ticket resolved + ClientNote canónica + task completed', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: ticket a resolver',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    const task = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );
    expect(task).not.toBeNull();

    const completeRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task!.id}/complete-ticket-bridge`,
      {
        ticket_action: 'resolve',
        resolution_note:
          'Se actualizó el plugin a la última versión, problema solucionado.',
      },
    );
    expect(
      completeRes.ok(),
      `complete-bridge: ${completeRes.status()} ${await completeRes.text()}`,
    ).toBeTruthy();

    const conv = await pool.query(
      `SELECT status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(conv.rows[0].status).toBe('resolved');

    const note = await pool.query(
      `SELECT category, source_system, triggered_by_action, body
       FROM client_notes
       WHERE source_system = 'ticket' AND source_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [ticketId],
    );
    expect(note.rowCount).toBe(1);
    expect(note.rows[0].category).toBe('support');
    expect(note.rows[0].triggered_by_action).toBe('ticket.resolved');

    const taskRow = await pool.query(
      `SELECT status, completed_by FROM tasks WHERE id = $1`,
      [task!.id],
    );
    expect(taskRow.rows[0].status).toBe('completed');
    expect(taskRow.rows[0].completed_by).not.toBeNull();
  });

  test('completar bridge sin resolution_note → 400', async ({ request }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: sin nota',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    const task = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );

    const res = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task!.id}/complete-ticket-bridge`,
      { ticket_action: 'resolve' },
    );
    expect(res.status()).toBe(400);
  });

  test('completar bridge close → ticket closed', async ({ request }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: ticket a cerrar',
      'low',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    const task = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task!.id}/complete-ticket-bridge`,
      {
        ticket_action: 'close',
        resolution_note: 'Cerrado tras 48h sin respuesta del cliente.',
      },
    );

    const conv = await pool.query(
      `SELECT status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(conv.rows[0].status).toBe('closed');
  });

  /* ELIMINADO en Sprint 13.5 Fase C (DC.34) — el spec "cancelar task
     bridge vía /cancel → ticket queda sin asignar" probaba el endpoint
     PATCH /tasks/:id/cancel que se ha eliminado físicamente del
     controller. La doctrina canónica establece que cancelar/reasignar
     pertenece al módulo support (`PATCH /support/conversations/:id` con
     assigned_agent_id=null) que emite `conversation.unassigned` y el
     listener `SupportTicketTaskCreatorListener.handleUnassigned` cancela
     la task bridge automáticamente. El test "desasignar ticket → cancela
     task bridge" cubre exactamente ese flujo canónico. */

  test('desasignar ticket → cancela task bridge activa (EC#8 preservado)', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: desasignar libera task',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    const task = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: null },
    );

    let finalStatus = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(`SELECT status FROM tasks WHERE id = $1`, [
        task!.id,
      ]);
      if (r.rows[0].status === 'cancelled') {
        finalStatus = 'cancelled';
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(finalStatus).toBe('cancelled');

    const conv = await pool.query(
      `SELECT assigned_agent_id, status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(conv.rows[0].assigned_agent_id).toBeNull();
    expect(conv.rows[0].status).toBe('open');
  });

  test('reabrir ticket cerrado → genera task bridge nueva (auditoría preservada)', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'Bridge: reapertura',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    const firstTask = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentSupportId,
    );
    expect(firstTask).not.toBeNull();

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${firstTask!.id}/complete-ticket-bridge`,
      {
        ticket_action: 'resolve',
        resolution_note: 'Resuelto inicialmente.',
      },
    );

    const reopenRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      {
        status: 'open',
        resolution_note: 'El cliente reporta que el problema reaparece.',
      },
    );
    expect(reopenRes.ok()).toBeTruthy();

    // Asignar de nuevo para disparar el listener (el reopen no asigna por
    // sí mismo).
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentBillingId },
    );

    const newTask = await waitForActiveBridgeTask(
      ticketId,
      (r) => r.assigned_to === agentBillingId,
    );
    expect(newTask).not.toBeNull();
    expect(newTask!.id).not.toBe(firstTask!.id);

    // La primera sigue completed (auditoría inmutable ADR-079 §3.2).
    const oldTask = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [firstTask!.id],
    );
    expect(oldTask.rows[0].status).toBe('completed');
  });
});

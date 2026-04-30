/**
 * E2E — Sprint 8 Fase B.10 (2026-04-30) — ADR-074.
 *
 * Cubre el bridge completo ticket↔task:
 *
 *   B.10.1 — Asignar agente a un ticket → listener crea Task(support_ticket).
 *   B.10.2 — Reasignar el ticket → la task existente se reasigna (no duplica).
 *   B.10.3 — Completar la task con `ticket_action='resolve'` + `resolution_note`
 *            → ticket pasa a `resolved` + ClientNote(solution) creada.
 *   B.10.4 — Completar la task sin `resolution_note` → 400.
 *   B.10.5 — Completar la task con `ticket_action='close'` → ticket pasa a `closed`.
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

/** Crea un ticket directamente en BD sin pasar por la API support
 *  (evita complejidad de crear conversación + escalation). */
async function createTicketInDb(
  userId: string,
  subject: string,
  priority: string = 'normal',
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO conversations (type, user_id, subject, priority, channel, status)
     VALUES ('ticket', $1, $2, $3::"ConversationPriority", 'web', 'open')
     RETURNING id`,
    [userId, subject, priority],
  );
  return res.rows[0].id as string;
}

test.describe.configure({ mode: 'serial' });

test.describe('Tasks ↔ Tickets bridge (Sprint 8 Fase B.10 / ADR-074)', () => {
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

  test('B.10.1 — asignar agente a ticket → crea support_ticket task', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.1 problema hosting',
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

    // Esperar a que el listener procese (event emitter es síncrono dentro
    // del mismo proceso, pero el create de task dispara más prisma calls
    // — damos margen).
    let task: { id: string; type: string; assigned_to: string } | null = null;
    for (let i = 0; i < 20; i++) {
      const dbRow = await pool.query(
        `SELECT id, type, assigned_to FROM tasks WHERE conversation_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [ticketId],
      );
      if (dbRow.rowCount && dbRow.rowCount > 0) {
        task = dbRow.rows[0] as {
          id: string;
          type: string;
          assigned_to: string;
        };
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(task).not.toBeNull();
    expect(task!.type).toBe('support_ticket');
    expect(task!.assigned_to).toBe(agentSupportId);
  });

  test('B.10.2 — reasignar ticket → reasigna task existente (no duplica)', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.2 reasignación',
      'normal',
    );

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );

    // Esperar a que la task se cree
    for (let i = 0; i < 20; i++) {
      const c = await pool.query(
        `SELECT count(*)::int as cnt FROM tasks WHERE conversation_id = $1`,
        [ticketId],
      );
      if (c.rows[0].cnt > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    // Reasignar
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentBillingId },
    );

    // Esperar reasignación (assigned_to actualizado)
    let final: { count: number; assigned_to: string } | null = null;
    for (let i = 0; i < 20; i++) {
      const c = await pool.query(
        `SELECT count(*)::int as cnt, MAX(assigned_to::text) as assigned_to
         FROM tasks WHERE conversation_id = $1`,
        [ticketId],
      );
      const assigned = c.rows[0].assigned_to;
      if (assigned === agentBillingId) {
        final = { count: c.rows[0].cnt, assigned_to: assigned };
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(final).not.toBeNull();
    expect(final!.count).toBe(1); // ¡no duplicada!
    expect(final!.assigned_to).toBe(agentBillingId);
  });

  test('B.10.3 — completar task bridge con resolve → ticket resolved + nota solución', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.3 ticket a resolver',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    let taskId = '';
    for (let i = 0; i < 20; i++) {
      const dbRow = await pool.query(
        `SELECT id FROM tasks WHERE conversation_id = $1 LIMIT 1`,
        [ticketId],
      );
      if (dbRow.rowCount && dbRow.rowCount > 0) {
        taskId = dbRow.rows[0].id as string;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(taskId).toBeTruthy();

    const completeRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      {
        ticket_action: 'resolve',
        resolution_note: 'Se actualizó el plugin a la última versión, problema solucionado.',
      },
    );
    expect(completeRes.ok()).toBeTruthy();

    // Verificar ticket resuelto
    const conv = await pool.query(
      `SELECT status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(conv.rows[0].status).toBe('resolved');

    // Verificar ClientNote(solution) creada
    const note = await pool.query(
      `SELECT category, body FROM client_notes
       WHERE conversation_id = $1 AND category = 'solution'
       ORDER BY created_at DESC LIMIT 1`,
      [ticketId],
    );
    expect(note.rowCount).toBe(1);
    expect(note.rows[0].body).toContain('Se actualizó el plugin');

    // Verificar tarea cerrada
    const taskRow = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(taskRow.rows[0].status).toBe('completed');
  });

  test('B.10.4 — completar task bridge sin resolution_note → 400', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.4 sin nota',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    let taskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks WHERE conversation_id = $1 LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        taskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }

    const res = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      { ticket_action: 'resolve' }, // sin resolution_note
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message.toLowerCase()).toContain('nota');
  });

  test('B.10.6 — cancelar task bridge → ticket queda sin asignar (fix feedback)', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.6 cancelar libera ticket',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    let taskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks WHERE conversation_id = $1 LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        taskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(taskId).toBeTruthy();

    // Confirmar pre-state: ticket asignado al agent_support
    const before = await pool.query(
      `SELECT assigned_agent_id, status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(before.rows[0].assigned_agent_id).toBe(agentSupportId);
    expect(before.rows[0].status).toBe('open');

    // Cancelar la task bridge
    const cancelRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}`,
      { status: 'cancelled' },
    );
    expect(cancelRes.ok()).toBeTruthy();
    const cancelled = (await cancelRes.json()) as {
      __ticket_released?: boolean;
      status: string;
    };
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.__ticket_released).toBe(true);

    // Ticket queda sin asignar pero abierto (no resuelto/cerrado)
    const after = await pool.query(
      `SELECT assigned_agent_id, status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(after.rows[0].assigned_agent_id).toBeNull();
    expect(after.rows[0].status).toBe('open');

    // Reasignar a otro agente → crea NUEVA task (la cancelada no se reusa)
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentBillingId },
    );
    let newTaskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks
         WHERE conversation_id = $1 AND status IN ('pending','in_progress')
         ORDER BY created_at DESC LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        newTaskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(newTaskId).toBeTruthy();
    expect(newTaskId).not.toBe(taskId);

    // Verificar que la cancelada sigue en BD (no borrada — auditoría)
    const oldTask = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(oldTask.rows[0].status).toBe('cancelled');
  });

  /* ═══════════════════════════════════════════════════════════════
     Sprint 8 Fase B.10.fix2 (2026-04-30) — ADR-074 EC#3, EC#7, EC#8.
     Cobertura de los 3 edge cases críticos de coherencia ticket↔task.
     ═══════════════════════════════════════════════════════════════ */

  test('B.10.7 — desasignar ticket cancela la task bridge activa (EC#8)', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.7 desasignar libera task',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    let taskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks WHERE conversation_id = $1
         AND status IN ('pending','in_progress') LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        taskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(taskId).toBeTruthy();

    // Desasignar el ticket
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: null },
    );

    // Esperar a que el listener cancele la task (cross-process events)
    let finalStatus = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT status FROM tasks WHERE id = $1`,
        [taskId],
      );
      if (r.rows[0].status === 'cancelled') {
        finalStatus = 'cancelled';
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(finalStatus).toBe('cancelled');

    // Ticket queda sin agente y sigue abierto (no cerrado)
    const conv = await pool.query(
      `SELECT assigned_agent_id, status FROM conversations WHERE id = $1`,
      [ticketId],
    );
    expect(conv.rows[0].assigned_agent_id).toBeNull();
    expect(conv.rows[0].status).toBe('open');
  });

  test('B.10.8 — ticket que nace asignado dispara creación de task (EC#7)', async ({
    request,
  }) => {
    // `createTicketForClient` asigna al actor (admin que llama). Esto cubre
    // el flujo "admin crea ticket proactivo para cliente" — el ticket nace
    // con `assigned_agent_id = superadmin.id`. Antes de B.10.fix2, la task
    // no se creaba porque `conversation.assigned` solo se emitía al
    // CAMBIAR el agente, no al crear con agente desde el inicio.
    const createRes = await authed(
      request,
      superadminToken,
      'POST',
      `/support/tickets?targetUserId=${clientUserId}`,
      {
        subject: 'B.10.8 ticket nace asignado',
        body: 'Mensaje inicial del admin',
        priority: 'high',
        category: 'support_general',
      },
    );
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as {
      id: string;
      assigned_agent_id: string;
    };
    expect(created.assigned_agent_id).toBeTruthy();

    // Esperar a que el listener cree la task
    let task: { id: string; type: string; assigned_to: string } | null = null;
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id, type, assigned_to FROM tasks
         WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [created.id],
      );
      if (r.rowCount && r.rowCount > 0) {
        task = r.rows[0] as { id: string; type: string; assigned_to: string };
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(task).not.toBeNull();
    expect(task!.type).toBe('support_ticket');
    expect(task!.assigned_to).toBe(created.assigned_agent_id);
  });

  test('B.10.9 — reabrir ticket con agente regenera task bridge (EC#3)', async ({
    request,
  }) => {
    // Crear ticket asignado, completar bridge → ticket resolved + task completed
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.9 reapertura',
      'normal',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    let firstTaskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks WHERE conversation_id = $1 LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        firstTaskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(firstTaskId).toBeTruthy();

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${firstTaskId}/complete`,
      {
        ticket_action: 'resolve',
        resolution_note: 'Resuelto inicialmente.',
      },
    );

    // Reabrir el ticket — admin
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

    // Esperar a que el listener cree NUEVA task (la primera está completed)
    let newTaskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks
         WHERE conversation_id = $1 AND status IN ('pending','in_progress')
         ORDER BY created_at DESC LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        newTaskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(newTaskId).toBeTruthy();
    expect(newTaskId).not.toBe(firstTaskId);

    // La primera sigue completed (auditoría)
    const oldTask = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [firstTaskId],
    );
    expect(oldTask.rows[0].status).toBe('completed');
  });

  test('B.10.5 — completar task bridge con close → ticket closed', async ({
    request,
  }) => {
    const ticketId = await createTicketInDb(
      clientUserId,
      'B.10.5 ticket a cerrar',
      'low',
    );
    await authed(
      request,
      superadminToken,
      'PATCH',
      `/support/conversations/${ticketId}`,
      { assigned_agent_id: agentSupportId },
    );
    let taskId = '';
    for (let i = 0; i < 20; i++) {
      const r = await pool.query(
        `SELECT id FROM tasks WHERE conversation_id = $1 LIMIT 1`,
        [ticketId],
      );
      if (r.rowCount && r.rowCount > 0) {
        taskId = r.rows[0].id as string;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }

    await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
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
});

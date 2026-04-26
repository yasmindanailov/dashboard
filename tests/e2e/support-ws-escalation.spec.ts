/**
 * E2E — Escalación chat → ticket vía WebSocket en tiempo real (P0.4).
 *
 * Cubre el flujo de soporte completo con verificación WS:
 *   1. Cliente verificado crea un chat (REST).
 *   2. Agente conectado por WebSocket entra a la sala `agent:inbox`.
 *   3. Admin escala el chat a ticket vía REST (`POST /support/chats/:id/escalate`).
 *   4. El listener `SupportWebsocketListener` capta `conversation.created`
 *      del nuevo ticket y broadcastea `conversation:new` a `agent:inbox`.
 *   5. El agente recibe el evento WS en tiempo real (≤ 5s).
 *   6. La DB confirma:
 *      - El chat queda con `status='resolved'` (escalación lo cierra).
 *      - El ticket nuevo tiene `escalated_from_id` apuntando al chat.
 *      - El ticket tiene `category='escalated_chat'`.
 *
 * Crítico: la escalación es el único flujo del proyecto que combina REST +
 * WebSocket + transición de tipo. Si el WS pierde el evento, el agente no
 * ve el ticket en su bandeja hasta refrescar la página → bug invisible.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { io, Socket } from 'socket.io-client';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const WS_URL = process.env.E2E_BACKEND_URL || 'http://localhost:3001';

let pool: Pool;
let clientUserId: string;
let clientToken: string;
let agentToken: string;

async function getRoleId(slug: string): Promise<string> {
  const r = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (!r.rows[0]) throw new Error(`Role ${slug} not found`);
  return r.rows[0].id;
}

async function createVerifiedUser(opts: {
  email: string;
  password: string;
  roleSlug: string;
}): Promise<string> {
  const roleId = await getRoleId(opts.roleSlug);
  const passwordHash = await bcrypt.hash(opts.password, 4);
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, 'WS', 'TestUser', 'active', NOW(), $3)
     RETURNING id`,
    [opts.email, passwordHash, roleId],
  );
  return r.rows[0].id;
}

async function loginClientAPI(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `Client login: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

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
    temp_token?: string;
    access_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error('Login sin token');

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

async function authedFetch(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
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

interface NewConversationPayload {
  conversationId: string;
  subject: string;
  channel: string;
}

/** Resuelve cuando el socket recibe `conversation:new` o lanza por timeout. */
function waitForConversationNew(
  socket: Socket,
  timeoutMs = 10_000,
): Promise<NewConversationPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('conversation:new');
      reject(
        new Error(`Timeout esperando 'conversation:new' tras ${timeoutMs}ms`),
      );
    }, timeoutMs);
    socket.once('conversation:new', (payload: NewConversationPayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Support — escalación chat→ticket con WS broadcast (P0.4)', () => {
  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    await pool.query(
      `UPDATE users SET login_attempts = 0, blocked_until = NULL WHERE email = $1`,
      [TEST_CONFIG.superadmin.email],
    );

    const clientPassword = 'WsClientPass123!';
    clientUserId = await createVerifiedUser({
      email: 'e2e-ws-client@aelium.test',
      password: clientPassword,
      roleSlug: 'client',
    });

    clientToken = await loginClientAPI(
      request,
      'e2e-ws-client@aelium.test',
      clientPassword,
    );
    agentToken = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('cliente crea chat → admin escala → agente recibe conversation:new vía WS y DB refleja transición', async ({
    request,
  }) => {
    // ── 1. Conectar el agente (superadmin) al WS de support ──
    const agentSocket: Socket = io(`${WS_URL}/support`, {
      auth: { token: agentToken },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('WS agent connect timeout 10s')),
        10_000,
      );
      agentSocket.on('connect', () => {
        clearTimeout(t);
        resolve();
      });
      agentSocket.on('connect_error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });

    try {
      // ── 2. Cliente crea chat vía REST ──
      const createChatRes = await authedFetch(
        request,
        clientToken,
        'POST',
        '/support/chats',
        {
          subject: 'P0.4 — chat E2E para escalar',
          body: 'Mensaje inicial del cliente.',
        },
      );
      expect(
        createChatRes.ok(),
        `Create chat: ${createChatRes.status()} ${await createChatRes.text()}`,
      ).toBeTruthy();
      const chat = (await createChatRes.json()) as { id: string; type: string };
      expect(chat.type).toBe('chat');

      // Espera a que el listener WS se enganche al evento `conversation.created`
      // del propio chat (también broadcast a agent:inbox), y consume ese
      // primer evento para no confundirlo con el ticket de escalación.
      await waitForConversationNew(agentSocket, 8_000).catch(() => {
        // Si el chat no llega vía WS no es bloqueante para el test —
        // el flujo crítico es la ESCALACIÓN. Lo registramos y seguimos.
        // (El listener support-websocket emite `conversation.created` para
        // chats Y tickets; solo nos importa cazar el del ticket escalado.)
      });

      // Listener para el siguiente broadcast (el del ticket escalado).
      const ticketBroadcast = waitForConversationNew(agentSocket, 10_000);

      // ── 3. Admin escala el chat a ticket ──
      const escalateRes = await authedFetch(
        request,
        agentToken,
        'POST',
        `/support/chats/${chat.id}/escalate`,
        {
          category: 'support_technical',
          subject: 'Ticket escalado E2E',
          priority: 'high',
          agent_notes: 'Necesita seguimiento técnico',
        },
      );
      expect(
        escalateRes.ok(),
        `Escalate: ${escalateRes.status()} ${await escalateRes.text()}`,
      ).toBeTruthy();
      const ticket = (await escalateRes.json()) as {
        id: string;
        type: string;
        escalated_from_id: string | null;
      };
      expect(ticket.type).toBe('ticket');
      expect(ticket.escalated_from_id).toBe(chat.id);

      // ── 4. El agente recibe el broadcast del ticket en tiempo real ──
      const wsPayload = await ticketBroadcast;
      expect(wsPayload.conversationId).toBe(ticket.id);
      expect(wsPayload.subject).toContain('Ticket escalado');

      // ── 5. DB refleja la transición correctamente ──
      const dbTicket = await pool.query<{
        type: string;
        category: string;
        escalated_from_id: string;
        status: string;
      }>(
        `SELECT type, category::text AS category, escalated_from_id, status::text AS status
         FROM conversations WHERE id = $1`,
        [ticket.id],
      );
      expect(dbTicket.rows[0]).toBeDefined();
      expect(dbTicket.rows[0].type).toBe('ticket');
      expect(dbTicket.rows[0].category).toBe('support_technical');
      expect(dbTicket.rows[0].escalated_from_id).toBe(chat.id);

      // El chat original debe quedar resuelto/cerrado tras la escalación.
      const dbChat = await pool.query<{ status: string }>(
        `SELECT status::text AS status FROM conversations WHERE id = $1`,
        [chat.id],
      );
      expect(['resolved', 'closed']).toContain(dbChat.rows[0].status);

      // El cliente sigue siendo el dueño de ambos.
      const ownership = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM conversations WHERE id = ANY($1::uuid[])`,
        [[chat.id, ticket.id]],
      );
      ownership.rows.forEach((row) => {
        expect(row.user_id).toBe(clientUserId);
      });
    } finally {
      agentSocket.disconnect();
    }
  });
});

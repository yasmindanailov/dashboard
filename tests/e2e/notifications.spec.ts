/**
 * E2E — Sprint 9.5 (ADR-042 + ADR-065): campana del Topbar end-to-end.
 *
 * Cubre los items diferidos del Sprint 9 Fase D:
 *   - GET  /notifications/unread       (campana)
 *   - GET  /notifications              (histórico paginado)
 *   - PATCH /notifications/:id/read    (marcar individual)
 *   - PATCH /notifications/read-all    (marcar todas)
 *   - Ownership server-side: cliente B NO ve notificaciones del agente.
 *
 * Flujo principal: superadmin crea una tarea asignada → el listener
 * `task.assigned` encola en `notifications-dispatch` → el processor
 * persiste la fila `notifications` (canal `internal`) vía InAppChannel
 * → el agente la ve en `/notifications/unread` → la marca como leída
 * → el contador queda en 0.
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
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;

let pool: Pool;
let staffToken = '';
let agentToken = '';
let agentUserId = '';
let clientToken = '';
let clientUserId = '';

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
  if (!body.temp_token) throw new Error('No token from superadmin login');

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

async function createUserAndLogin(
  request: APIRequestContext,
  emailPrefix: string,
  roleSlug: 'agent_support' | 'client',
): Promise<{ token: string; userId: string }> {
  const email = `${emailPrefix}-${Date.now()}@aelium.test`;
  const password = 'NotifTest2026!';
  const hash = await bcrypt.hash(password, 4);

  const res = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, role_id, email_verified_at)
     VALUES ($1, $2, 'E2E', 'Notif', 'active',
       (SELECT id FROM roles WHERE slug = $3), now())
     RETURNING id`,
    [email, hash, roleSlug],
  );
  const userId = res.rows[0].id;

  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };

  if (body.access_token) return { token: body.access_token, userId };

  // agent_support requiere 2FA — leemos el código del mailbox.
  if (!body.temp_token) throw new Error(`Login ${roleSlug} sin tokens`);
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
  return { token: verifyBody.access_token, userId };
}

/**
 * Polling helper: la creación de la tarea encola un job en BullMQ y el
 * processor persiste la notificación de forma asíncrona. Esperamos hasta
 * que `unread_count > 0` o reventamos el timeout.
 */
async function pollUntilUnread(
  request: APIRequestContext,
  token: string,
  expectedMinCount: number,
): Promise<{ data: Array<{ id: string; title: string; action_url: string | null; metadata: Record<string, unknown> | null }>; unread_count: number }> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/notifications/unread`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: Array<{ id: string; title: string; action_url: string | null; metadata: Record<string, unknown> | null }>;
      unread_count: number;
    };
    if (body.unread_count >= expectedMinCount) return body;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timeout (${POLL_TIMEOUT_MS}ms) esperando unread_count >= ${expectedMinCount}`,
  );
}

test.describe.serial('Notifications campana — Sprint 9.5 (ADR-042/065)', () => {
  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await resetTestData();
    staffToken = await loginSuperadminAPI(request);
    const agent = await createUserAndLogin(request, 'notif-agent', 'agent_support');
    agentToken = agent.token;
    agentUserId = agent.userId;
    const client = await createUserAndLogin(request, 'notif-client', 'client');
    clientToken = client.token;
    clientUserId = client.userId;
  });

  test.afterAll(async () => {
    await disconnectDb();
    await pool.end();
  });

  test('agente sin notificaciones → /unread devuelve [] y count=0', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/notifications/unread`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[]; unread_count: number };
    expect(body.unread_count).toBe(0);
    expect(body.data).toEqual([]);
  });

  test('admin asigna tarea → agente ve la notificación, la marca leída y /unread cae a 0', async ({
    request,
  }) => {
    // Sprint 16 (ADR-079): no hay POST /tasks manual. Insertamos la task
    // en cola pública vía SQL (simula el trigger), luego PATCH /assign
    // dispara el emit `task.assigned` que alimenta la campana del agente.
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: null,
      priority: 'high',
    });

    const assignRes = await request.fetch(
      `${TEST_CONFIG.apiUrl}/tasks/${taskId}/assign`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({ assigned_to: agentUserId }),
      },
    );
    expect(
      assignRes.ok(),
      `assign task: ${assignRes.status()} ${await assignRes.text()}`,
    ).toBeTruthy();

    // 2. Polling al endpoint `/notifications/unread` hasta ver la fila.
    const unread = await pollUntilUnread(request, agentToken, 1);
    expect(unread.unread_count).toBeGreaterThanOrEqual(1);
    const newest = unread.data[0];
    expect(newest.title?.toLowerCase()).toMatch(/tarea|nueva/i);
    // ADR-079 + Sprint 13 §13.AUTH §11.1 B7: el frontend NO tiene
    // `/admin/tasks/[id]`. Para tasks no-bridge la URL canónica es la
    // lista `/admin/tasks`; bridge `support_ticket` apunta al ticket.
    // Aquí la task es `client_lifecycle` (no bridge).
    expect(newest.action_url).toBe('/admin/tasks');
    // El processor adjunta `event` y `action_url` en metadata (ver
    // notifications-dispatch.processor.ts §channelMetadata).
    expect(
      (newest.metadata as { event?: string } | null)?.event,
    ).toBe('task.assigned');

    // 3. PATCH /:id/read → idempotente y baja el contador.
    const readRes = await request.patch(
      `${TEST_CONFIG.apiUrl}/notifications/${newest.id}/read`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    expect(readRes.ok()).toBeTruthy();
    expect(((await readRes.json()) as { read: true }).read).toBe(true);

    const afterRead = await request.get(
      `${TEST_CONFIG.apiUrl}/notifications/unread`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    const afterReadBody = (await afterRead.json()) as { unread_count: number };
    expect(afterReadBody.unread_count).toBe(unread.unread_count - 1);

    // 4. Idempotencia: re-marcar leída no incrementa nada y devuelve {read:true}.
    const reRead = await request.patch(
      `${TEST_CONFIG.apiUrl}/notifications/${newest.id}/read`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    expect(reRead.ok()).toBeTruthy();
  });

  test('cliente NO ve notificaciones del agente (ownership filter server-side)', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/notifications/unread`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[]; unread_count: number };
    // El cliente no tiene tareas, no debería ver nada.
    expect(body.unread_count).toBe(0);
  });

  test('GET /notifications devuelve histórico paginado del usuario', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/notifications?page=1&limit=10`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: Array<{ id: string; read_at: string | null }>;
      meta: { total: number; page: number; limit: number; totalPages: number };
    };
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(10);
    // El test anterior generó al menos una notification para el agente.
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    // Y al menos una está marcada como leída tras el test previo.
    expect(body.data.some((n) => n.read_at !== null)).toBe(true);
  });

  test('PATCH /notifications/read-all marca todas como leídas', async ({
    request,
  }) => {
    // Sprint 16 (ADR-079): generamos otra task vía SQL + assign para que
    // el listener task.assigned alimente la campana del agente.
    const taskId = await insertTask(pool, {
      source_system: 'project',
      client_id: clientUserId,
      assigned_to: null,
      priority: 'medium',
    });
    const assignRes = await request.fetch(
      `${TEST_CONFIG.apiUrl}/tasks/${taskId}/assign`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({ assigned_to: agentUserId }),
      },
    );
    expect(assignRes.ok()).toBeTruthy();
    await pollUntilUnread(request, agentToken, 1);

    const res = await request.patch(
      `${TEST_CONFIG.apiUrl}/notifications/read-all`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBeGreaterThanOrEqual(1);

    const after = await request.get(
      `${TEST_CONFIG.apiUrl}/notifications/unread`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    const afterBody = (await after.json()) as { unread_count: number };
    expect(afterBody.unread_count).toBe(0);
  });

  test('PATCH /:id/read sobre id ajeno → 404 (no filtra existencia)', async ({
    request,
  }) => {
    // Insertamos una notificación directamente para el cliente, NO el agente.
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO notifications (user_id, channel, title, body, sent_at)
       VALUES ($1, 'internal', 'Privada cliente', 'no agente', now())
       RETURNING id`,
      [clientUserId],
    );
    const otherId = inserted.rows[0].id;

    // El agente intenta marcarla como leída → 404, NO 403.
    const res = await request.patch(
      `${TEST_CONFIG.apiUrl}/notifications/${otherId}/read`,
      { headers: { Authorization: `Bearer ${agentToken}` } },
    );
    expect(res.status()).toBe(404);
  });
});

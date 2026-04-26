/**
 * E2E — Outbox Pattern para los 4 eventos invoice.* (P0.2 / ADR-033 / R8).
 *
 * Verifica que:
 *   1. Crear / marcar-pagada / marcar-vencida una factura inserta una fila
 *      en `event_outbox` dentro de la misma transacción que el cambio de
 *      estado (commit atómico → no es posible "factura cambiada en BD pero
 *      evento perdido").
 *   2. El `OutboxWorker` (`@Interval(5s)` + `FOR UPDATE SKIP LOCKED`) procesa
 *      la fila → estado `done` con `processed_at` poblado.
 *   3. Crash recovery simulado: una fila insertada manualmente con
 *      `status='processing'` (como si el proceso anterior hubiera muerto
 *      mid-emit) NO bloquea el sistema y permanece reclamada por
 *      `OnModuleInit` cuando el worker arranca; aquí simulamos el caso
 *      complementario: una fila huérfana en `pending` (proceso murió tras
 *      commit) → el worker la procesa al siguiente tick.
 *
 * NO se verifica el contenido del email: ese flujo lo cubre la suite de
 * billing futura. Aquí solo nos importa la durabilidad del evento — que es
 * lo que el Outbox Pattern garantiza (R8).
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

// El worker corre cada 5s + jitter; damos margen razonable para cubrir
// dispatch + 1 reintento si la primera vuelta no lo cazó.
const WORKER_TICK_MS = 5_000;
const DISPATCH_TIMEOUT_MS = WORKER_TICK_MS * 3;

let pool: Pool;
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

interface OutboxRow {
  id: string;
  event_type: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  retry_count: number;
  processed_at: Date | null;
  payload: Record<string, unknown>;
  last_error: string | null;
}

async function findOutboxRows(
  invoiceId: string,
  eventType: string,
): Promise<OutboxRow[]> {
  const res = await pool.query<OutboxRow>(
    `SELECT id, event_type, status, retry_count, processed_at, payload, last_error
     FROM event_outbox
     WHERE event_type = $1
       AND payload->>'invoice_id' = $2
     ORDER BY created_at ASC`,
    [eventType, invoiceId],
  );
  return res.rows;
}

async function waitUntilDone(
  invoiceId: string,
  eventType: string,
  timeoutMs = DISPATCH_TIMEOUT_MS,
): Promise<OutboxRow> {
  const deadline = Date.now() + timeoutMs;
  let last: OutboxRow | undefined;
  while (Date.now() < deadline) {
    const rows = await findOutboxRows(invoiceId, eventType);
    last = rows[0];
    if (last && last.status === 'done') return last;
    if (last && last.status === 'failed') {
      throw new Error(
        `Outbox ${eventType} para factura ${invoiceId} llegó a failed: ${last.last_error}`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timeout esperando outbox ${eventType} done. Estado actual: ${
      last ? `${last.status} (retry=${last.retry_count})` : 'sin filas'
    }`,
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Outbox Pattern — invoice.* (P0.2 / R8)', () => {
  let sharedToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    clientUserId = await createUser({
      email: 'e2e-outbox-client@aelium.test',
      firstName: 'Olivia',
      lastName: 'Outbox',
      roleSlug: 'client',
    });
    sharedToken = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('createInvoice → fila outbox invoice.created insertada en la misma transacción y procesada', async ({
    request,
  }) => {
    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    const createRes = await authedRequest(
      request,
      sharedToken,
      'POST',
      '/billing/invoices',
      {
        user_id: clientUserId,
        due_date: dueDate,
        currency: 'EUR',
        items: [
          {
            description: 'Item E2E outbox.created',
            quantity: 1,
            unit_price: 100,
          },
        ],
      },
    );
    expect(
      createRes.ok(),
      `Create invoice falló: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    const invoice = (await createRes.json()) as { id: string };

    // Persistencia atómica: la fila outbox existe ya, antes de que el worker
    // haya tenido tiempo de despacharla (no bloqueamos en este check).
    const initial = await findOutboxRows(invoice.id, 'invoice.created');
    expect(initial).toHaveLength(1);
    expect(['pending', 'processing', 'done']).toContain(initial[0].status);
    expect(initial[0].payload).toMatchObject({
      invoice_id: invoice.id,
      user_id: clientUserId,
      currency: 'EUR',
    });

    // Eventualmente el worker la marca como done.
    const done = await waitUntilDone(invoice.id, 'invoice.created');
    expect(done.processed_at).not.toBeNull();
    expect(done.retry_count).toBe(0);
  });

  test('markAsPaid → outbox invoice.paid persistido + dispatched', async ({
    request,
  }) => {
    // 1. Crear factura draft
    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    const createRes = await authedRequest(
      request,
      sharedToken,
      'POST',
      '/billing/invoices',
      {
        user_id: clientUserId,
        due_date: dueDate,
        currency: 'EUR',
        items: [
          { description: 'Item E2E outbox.paid', quantity: 1, unit_price: 50 },
        ],
      },
    );
    expect(createRes.ok()).toBeTruthy();
    const invoice = (await createRes.json()) as { id: string };

    // 2. Finalizar (draft → pending) — necesario antes de pay
    const finalizeRes = await authedRequest(
      request,
      sharedToken,
      'PATCH',
      `/billing/invoices/${invoice.id}/finalize`,
    );
    expect(finalizeRes.ok()).toBeTruthy();

    // 3. Marcar pagada
    const payRes = await authedRequest(
      request,
      sharedToken,
      'PATCH',
      `/billing/invoices/${invoice.id}/pay`,
      { payment_method: 'manual', payment_ref: 'TEST-OUTBOX' },
    );
    expect(
      payRes.ok(),
      `Pay falló: ${payRes.status()} ${await payRes.text()}`,
    ).toBeTruthy();

    // 4. La factura quedó paid Y la fila outbox.paid existe. Si el commit
    //    fuese parcial (factura sí, outbox no) este test se rompería.
    const invoiceRow = await pool.query(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoice.id],
    );
    expect(invoiceRow.rows[0].status).toBe('paid');

    const paidOutbox = await findOutboxRows(invoice.id, 'invoice.paid');
    expect(paidOutbox).toHaveLength(1);
    expect(paidOutbox[0].payload).toMatchObject({
      invoice_id: invoice.id,
      payment_provider: 'manual',
    });

    const done = await waitUntilDone(invoice.id, 'invoice.paid');
    expect(done.status).toBe('done');
  });

  test('markAsOverdue → outbox invoice.overdue persistido + dispatched', async ({
    request,
  }) => {
    // 1. Crear factura ya vencida (due_date en el pasado) y finalizar a pending
    const pastDue = new Date(Date.now() - 86400_000).toISOString();
    const createRes = await authedRequest(
      request,
      sharedToken,
      'POST',
      '/billing/invoices',
      {
        user_id: clientUserId,
        due_date: pastDue,
        currency: 'EUR',
        items: [
          {
            description: 'Item E2E outbox.overdue',
            quantity: 1,
            unit_price: 30,
          },
        ],
      },
    );
    expect(createRes.ok()).toBeTruthy();
    const invoice = (await createRes.json()) as { id: string };

    const finalizeRes = await authedRequest(
      request,
      sharedToken,
      'PATCH',
      `/billing/invoices/${invoice.id}/finalize`,
    );
    expect(finalizeRes.ok()).toBeTruthy();

    // 2. Forzar overdue vía endpoint
    const overdueRes = await authedRequest(
      request,
      sharedToken,
      'PATCH',
      `/billing/invoices/${invoice.id}/overdue`,
    );
    expect(
      overdueRes.ok(),
      `Overdue falló: ${overdueRes.status()} ${await overdueRes.text()}`,
    ).toBeTruthy();

    const overdueOutbox = await findOutboxRows(invoice.id, 'invoice.overdue');
    expect(overdueOutbox).toHaveLength(1);
    expect(overdueOutbox[0].payload).toMatchObject({
      invoice_id: invoice.id,
      retry_count: 1,
    });

    const done = await waitUntilDone(invoice.id, 'invoice.overdue');
    expect(done.status).toBe('done');
  });

  test('crash simulado: fila pending huérfana (proceso muerto post-commit) → worker la procesa', async ({
    request,
  }) => {
    // Creamos una factura para tener un user_id válido en el payload.
    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    const createRes = await authedRequest(
      request,
      sharedToken,
      'POST',
      '/billing/invoices',
      {
        user_id: clientUserId,
        due_date: dueDate,
        currency: 'EUR',
        items: [
          { description: 'Item crash sim', quantity: 1, unit_price: 10 },
        ],
      },
    );
    expect(createRes.ok()).toBeTruthy();
    const invoice = (await createRes.json()) as { id: string };

    // Insertamos manualmente una fila como si EventEmitter2 no se hubiera
    // ejecutado nunca (proceso anterior crasheó tras commit). Usamos un
    // event_type real con consumidor (`invoice.paid`) → el listener leerá
    // el user_id, encontrará el cliente y enviará el email. El worker debe
    // marcar la fila como done.
    const insertRes = await pool.query(
      `INSERT INTO event_outbox (event_type, payload, status)
       VALUES ('invoice.paid', $1::jsonb, 'pending')
       RETURNING id`,
      [
        JSON.stringify({
          invoice_id: invoice.id,
          invoice_number: 'CRASH-RECOVERY-TEST',
          user_id: clientUserId,
          total: 10,
          currency: 'EUR',
          payment_provider: 'manual',
        }),
      ],
    );
    const orphanId = insertRes.rows[0].id;

    // Esperamos a que el worker lo procese.
    const deadline = Date.now() + DISPATCH_TIMEOUT_MS;
    let finalRow: OutboxRow | undefined;
    while (Date.now() < deadline) {
      const r = await pool.query<OutboxRow>(
        `SELECT id, event_type, status, retry_count, processed_at, payload, last_error
         FROM event_outbox WHERE id = $1`,
        [orphanId],
      );
      finalRow = r.rows[0];
      if (finalRow?.status === 'done') break;
      if (finalRow?.status === 'failed') {
        throw new Error(
          `Crash recovery falló: outbox row ${orphanId} en failed (${finalRow.last_error})`,
        );
      }
      await new Promise((res) => setTimeout(res, 500));
    }

    expect(finalRow?.status).toBe('done');
    expect(finalRow?.processed_at).not.toBeNull();
  });
});

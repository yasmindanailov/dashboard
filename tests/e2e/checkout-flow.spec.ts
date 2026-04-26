/**
 * E2E — Flujo completo de billing + PDF (P0.4).
 *
 * Cubre el camino real del dinero:
 *   1. Admin crea factura manual (POST /billing/invoices) — `invoice.created`
 *      queda persistido en `event_outbox` (verificable en DB).
 *   2. Admin finaliza la factura (`/finalize`) → status pasa a `pending`.
 *   3. Admin marca como pagada (`/pay`) — `invoice.paid` en outbox.
 *   4. **Descarga PDF** (`/pdf`): respuesta 200, `Content-Type: application/pdf`,
 *      magic bytes `%PDF-` al inicio del buffer.
 *   5. El PDF tiene tamaño razonable (>1KB, <5MB) — descarta vacíos o
 *      documentos truncados.
 *
 * Crítico legal/financiero: la factura emitida debe poderse descargar como
 * PDF válido (Hacienda exige retención 10 años). Si el endpoint devolviese
 * HTML o un buffer roto sin que nadie se entere, sería un fallo invisible.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

const WORKER_TICK_MS = 5_000;
const DISPATCH_TIMEOUT_MS = WORKER_TICK_MS * 3;

let pool: Pool;
let superadminUserId: string;

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
  const body = (await loginRes.json()) as {
    temp_token?: string;
    access_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error('Login sin access_token ni temp_token');

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

async function findOutboxRow(
  invoiceId: string,
  eventType: string,
): Promise<{ status: string; processed_at: Date | null } | null> {
  const r = await pool.query<{ status: string; processed_at: Date | null }>(
    `SELECT status, processed_at FROM event_outbox
      WHERE event_type = $1 AND payload->>'invoice_id' = $2
      ORDER BY created_at DESC LIMIT 1`,
    [eventType, invoiceId],
  );
  return r.rows[0] ?? null;
}

async function waitOutboxDone(invoiceId: string, eventType: string): Promise<void> {
  const deadline = Date.now() + DISPATCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const row = await findOutboxRow(invoiceId, eventType);
    if (row?.status === 'done') return;
    if (row?.status === 'failed') {
      throw new Error(`Outbox ${eventType} para ${invoiceId} llegó a failed`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout esperando outbox.done para ${eventType} (${invoiceId})`);
}

test.describe.configure({ mode: 'serial' });

test.describe('Billing — flujo completo + PDF (P0.4)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    await pool.query(
      `UPDATE users SET login_attempts = 0, blocked_until = NULL WHERE email = $1`,
      [TEST_CONFIG.superadmin.email],
    );

    const r = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [TEST_CONFIG.superadmin.email],
    );
    superadminUserId = r.rows[0].id;

    token = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('crear → finalizar → pagar → descargar PDF; outbox.created y outbox.paid llegan a done', async ({
    request,
  }) => {
    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString();

    // ── 1. Crear factura ──
    const createRes = await authedFetch(
      request,
      token,
      'POST',
      '/billing/invoices',
      {
        user_id: superadminUserId,
        due_date: dueDate,
        currency: 'EUR',
        items: [
          { description: 'P0.4 — Servicio de prueba', quantity: 1, unit_price: 250 },
        ],
      },
    );
    expect(
      createRes.ok(),
      `Create falló: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    const invoice = (await createRes.json()) as {
      id: string;
      status: string;
      invoice_number: string;
      total: string | number;
    };
    expect(invoice.status).toBe('draft');
    expect(invoice.invoice_number).toMatch(/AELIUM-\d{4}-\d{4}/);
    expect(Number(invoice.total)).toBeGreaterThan(0);

    // Outbox invoice.created persistido inmediatamente (transacción atómica).
    const createdInitial = await findOutboxRow(invoice.id, 'invoice.created');
    expect(createdInitial).not.toBeNull();
    expect(['pending', 'processing', 'done']).toContain(createdInitial!.status);

    // ── 2. Finalizar (draft → pending) ──
    const finalizeRes = await authedFetch(
      request,
      token,
      'PATCH',
      `/billing/invoices/${invoice.id}/finalize`,
    );
    expect(finalizeRes.ok()).toBeTruthy();
    const finalized = (await finalizeRes.json()) as { status: string };
    expect(finalized.status).toBe('pending');

    // ── 3. Marcar pagada ──
    const payRes = await authedFetch(
      request,
      token,
      'PATCH',
      `/billing/invoices/${invoice.id}/pay`,
      { payment_method: 'manual', payment_ref: 'P0.4-TEST' },
    );
    expect(payRes.ok()).toBeTruthy();
    const paid = (await payRes.json()) as { status: string; paid_at: string };
    expect(paid.status).toBe('paid');
    expect(paid.paid_at).toBeTruthy();

    // Worker procesa los dos eventos.
    await waitOutboxDone(invoice.id, 'invoice.created');
    await waitOutboxDone(invoice.id, 'invoice.paid');

    // ── 4. Descargar PDF y validar magic bytes ──
    const pdfRes = await request.get(
      `${TEST_CONFIG.apiUrl}/billing/invoices/${invoice.id}/pdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(
      pdfRes.ok(),
      `PDF download falló: ${pdfRes.status()} ${await pdfRes.text()}`,
    ).toBeTruthy();

    const contentType = pdfRes.headers()['content-type'];
    expect(contentType).toContain('application/pdf');

    const disposition = pdfRes.headers()['content-disposition'];
    expect(disposition).toContain(invoice.invoice_number);
    expect(disposition).toMatch(/\.pdf/);

    const buffer = await pdfRes.body();
    expect(
      buffer.length,
      `PDF demasiado pequeño: ${buffer.length} bytes`,
    ).toBeGreaterThan(1024);
    expect(
      buffer.length,
      `PDF demasiado grande: ${buffer.length} bytes`,
    ).toBeLessThan(5 * 1024 * 1024);

    // Magic bytes: PDF válido empieza con "%PDF-" (0x25 0x50 0x44 0x46 0x2D).
    expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });
});

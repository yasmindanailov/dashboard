/**
 * E2E — Persistencia de PDFs de facturas en MinIO (Sprint 11.5 + ADR-062
 * · Sprint 9 Fase B + ADR-063).
 *
 * Verifica el flujo de storage canónico tras la migración a BullMQ:
 *   1. Crear factura → finalizar → pagar (admin manual).
 *   2. `BillingInvoiceService.markAsPaid()` encola un job en la cola
 *      `pdf-generation` con `jobId='invoice-pdf-{invoice_id}'`. El
 *      `PdfGenerationProcessor` lo consume y dispara
 *      `InvoicePdfStorageService.generateAndUpload()`. Esperamos a que
 *      termine vía poll de `pdf_url` en la DB (timeout generoso para cubrir
 *      el procesado de cola).
 *   3. La columna `Invoice.pdf_url` queda con la S3 key esperada
 *      (`invoices/{invoice_number}.pdf`) — NO una URL completa, NO null.
 *   4. `GET /billing/invoices/:id/pdf` responde con un PDF válido (magic
 *      bytes `%PDF-`). Playwright sigue redirects por defecto, así que la
 *      respuesta final es la del bucket — eso valida implícitamente que el
 *      objeto está en MinIO y la signed URL es accesible.
 *   5. Fallback: si una factura legacy no tiene `pdf_url`, la primera
 *      descarga lo regenera y popula `pdf_url`. Lo cubrimos forzando
 *      `pdf_url = NULL` en la DB y volviendo a descargar.
 *
 * Crítico: que un PDF de Hacienda quede sólo en memoria del proceso era una
 * deuda. Este test garantiza que el ciclo es persistente bucket-side y, tras
 * Fase B, también ejercita implícitamente la infra BullMQ (queue + worker
 * + DLQ register en boot) — cumple R2 estricto + R13.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

const UPLOAD_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

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

async function readPdfUrl(invoiceId: string): Promise<string | null> {
  const r = await pool.query<{ pdf_url: string | null }>(
    `SELECT pdf_url FROM invoices WHERE id = $1`,
    [invoiceId],
  );
  return r.rows[0]?.pdf_url ?? null;
}

async function waitForPdfUrl(invoiceId: string): Promise<string> {
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const url = await readPdfUrl(invoiceId);
    if (url) return url;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timeout esperando que pdf_url se popule para invoice ${invoiceId}. ` +
      `¿Está MinIO arriba en el endpoint configurado en S3_ENDPOINT?`,
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Storage — PDFs persistidos en MinIO (Sprint 11.5 + ADR-062)', () => {
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

  test('pagar factura → pdf_url contiene S3 key + descarga devuelve PDF válido', async ({
    request,
  }) => {
    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString();

    // 1. Crear factura
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
          {
            description: 'Storage E2E — servicio de prueba',
            quantity: 1,
            unit_price: 99,
          },
        ],
      },
    );
    expect(createRes.ok()).toBeTruthy();
    const invoice = (await createRes.json()) as {
      id: string;
      invoice_number: string;
    };
    expect(invoice.invoice_number).toMatch(/^[A-Z]+-\d{4}-\d{4}$/);

    // 2. Finalizar (draft → pending). Dispara upload background.
    const finalizeRes = await authedFetch(
      request,
      token,
      'PATCH',
      `/billing/invoices/${invoice.id}/finalize`,
    );
    expect(finalizeRes.ok()).toBeTruthy();

    // 3. Pagar. Dispara segundo upload background (mismo key, sobrescribe).
    const payRes = await authedFetch(
      request,
      token,
      'PATCH',
      `/billing/invoices/${invoice.id}/pay`,
      { payment_method: 'manual', payment_ref: 'STORAGE-E2E' },
    );
    expect(payRes.ok()).toBeTruthy();

    // 4. Esperar a que pdf_url quede populado (fire-and-forget terminó).
    const pdfUrl = await waitForPdfUrl(invoice.id);
    expect(pdfUrl).toBe(`invoices/${invoice.invoice_number}.pdf`);

    // 5a. Endpoint frontend `/pdf-url`: JSON con signed URL.
    const urlRes = await authedFetch(
      request,
      token,
      'GET',
      `/billing/invoices/${invoice.id}/pdf-url`,
    );
    expect(urlRes.ok()).toBeTruthy();
    const urlBody = (await urlRes.json()) as { url: string; filename: string };
    expect(urlBody.url).toMatch(/^https?:\/\//);
    expect(urlBody.filename).toBe(`${invoice.invoice_number}.pdf`);

    // 5b. La signed URL devuelve un PDF válido directamente (sin auth).
    const directRes = await request.get(urlBody.url);
    expect(directRes.ok()).toBeTruthy();
    const directBuffer = await directRes.body();
    expect(directBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');

    // 6. Endpoint legacy `/pdf` (302 redirect) — simulación correcta del
    //    cliente de correo / curl: el cliente HTTP sigue el redirect SIN
    //    propagar el header Authorization (S3/MinIO rechaza con 400
    //    "multiple authentication types" si se mezcla Bearer JWT + signed
    //    URL en query). Usamos `maxRedirects: 0` para capturar el 302 y
    //    luego GET la Location sin auth (igual que haría un browser al
    //    abrir un link de un email).
    const redirectRes = await request.get(
      `${TEST_CONFIG.apiUrl}/billing/invoices/${invoice.id}/pdf`,
      { headers: { Authorization: `Bearer ${token}` }, maxRedirects: 0 },
    );
    expect(redirectRes.status()).toBe(302);
    const location = redirectRes.headers()['location'];
    expect(location).toMatch(/^https?:\/\/.+X-Amz-Signature=/);

    const finalRes = await request.get(location);
    expect(
      finalRes.ok(),
      `Descarga PDF falló: ${finalRes.status()} ${await finalRes.text()}`,
    ).toBeTruthy();

    const buffer = await finalRes.body();
    expect(
      buffer.length,
      `PDF demasiado pequeño: ${buffer.length} bytes`,
    ).toBeGreaterThan(1024);
    expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');

    const contentType = finalRes.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
  });

  test('factura sin pdf_url (legacy) → fallback regenera + popula pdf_url en primera descarga', async ({
    request,
  }) => {
    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString();
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
          {
            description: 'Legacy fallback — servicio de prueba',
            quantity: 1,
            unit_price: 50,
          },
        ],
      },
    );
    expect(createRes.ok()).toBeTruthy();
    const invoice = (await createRes.json()) as {
      id: string;
      invoice_number: string;
    };

    // Forzar pdf_url = NULL para simular factura legacy o upload previo fallido.
    await pool.query(`UPDATE invoices SET pdf_url = NULL WHERE id = $1`, [
      invoice.id,
    ]);
    expect(await readPdfUrl(invoice.id)).toBeNull();

    // Descargar — el endpoint debe regenerar + subir + popular pdf_url
    // y luego responder 302 a la signed URL. Capturamos el 302 sin
    // seguirlo (Authorization Bearer no debe propagarse cross-origin) y
    // hacemos el GET final sin auth, igual que un cliente real.
    const redirectRes = await request.get(
      `${TEST_CONFIG.apiUrl}/billing/invoices/${invoice.id}/pdf`,
      { headers: { Authorization: `Bearer ${token}` }, maxRedirects: 0 },
    );
    expect(redirectRes.status()).toBe(302);
    const location = redirectRes.headers()['location'];

    const finalRes = await request.get(location);
    expect(
      finalRes.ok(),
      `Descarga PDF falló: ${finalRes.status()} ${await finalRes.text()}`,
    ).toBeTruthy();
    const buffer = await finalRes.body();
    expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');

    // Tras la descarga, pdf_url ya está populado.
    const pdfUrl = await readPdfUrl(invoice.id);
    expect(pdfUrl).toBe(`invoices/${invoice.invoice_number}.pdf`);
  });
});

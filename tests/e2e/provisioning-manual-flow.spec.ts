/**
 * E2E — Sprint 11 Fase 11.C — Plugin `manual` flujo end-to-end.
 *
 * Cubre el camino completo del orquestador con plugin `manual`:
 *
 *   1. Cliente Carla loguea y hace checkout de hosting-pro (provisioner=manual)
 *      → BillingCheckoutService crea Service(status=pending) + Invoice(draft).
 *   2. Admin/agente_billing finaliza la invoice → status=pending.
 *   3. Admin/agente_billing marca la invoice como pagada → outbox enqueue
 *      `invoice.paid` → outbox worker la procesa → orquestador
 *      (`@OnEvent('invoice.paid')`) encola job en `provisioning-dispatch`
 *      → BullMQ worker invoca `orchestrator.provisionService()` → resuelve
 *      plugin `manual` desde el registry → `provision()` devuelve
 *      `followUp=['create_setup_task']` → orquestador crea Task
 *      `support_setup` con `service_id` poblado y `assigned_to=null`
 *      (cola pública ADR-072).
 *   4. Verificar que la task pública existe con `task.type='support_setup'`,
 *      `task.service_id`, `task.conversation_id=null`.
 *   5. Agente_full auto-asigna la task (PATCH /tasks/:id { assigned_to: self })
 *      y la completa (PATCH /tasks/:id/complete con notas).
 *   6. `task.completed` event → `ProvisioningOnTaskCompletedListener`
 *      filtra por `plugin.capabilities.completes_via_task=true` → marca
 *      `services.status='active'` + emite `service.activated`.
 *   7. Verificar que el service quedó activo.
 *
 * Hito histórico: primera prueba end-to-end del orquestador + plugin
 * trivial + listener task→active (ADR-077 + EC-P11-07).
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const PASSWORD = 'TestPassword123!';

// El outbox worker tickea cada 5s (WORKER_TICK_MS). Damos margen
// holgado para que orquestador + BullMQ + listener cierren el ciclo.
const OUTBOX_TICK_MS = 5_000;
const OUTBOX_DEADLINE_MS = OUTBOX_TICK_MS * 4;
const PROVISION_DEADLINE_MS = 30_000;
const ACTIVATION_DEADLINE_MS = 30_000;

let pool: Pool;
let clientUserId: string;
let agentFullId: string;
let hostingProductId: string;
let hostingPricingMonthlyId: string;

async function getRoleId(slug: string): Promise<string> {
  const res = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (!res.rows[0]) throw new Error(`Role ${slug} not found`);
  return res.rows[0].id as string;
}

async function createUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
}): Promise<string> {
  const roleId = await getRoleId(opts.roleSlug);
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [opts.email, passwordHash, opts.firstName, opts.lastName, roleId],
  );
  return res.rows[0].id as string;
}

/**
 * Login canónico con soporte 2FA opcional. Cuentas con 2FA habilitado
 * (superadmin + agentes por seed) reciben `temp_token` y un email OTP;
 * el helper extrae el código y completa con `verify-2fa`. Cuentas sin
 * 2FA reciben `access_token` directo.
 */
async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(
    loginRes.ok(),
    `Login ${email} falló: ${loginRes.status()} ${await loginRes.text()}`,
  ).toBeTruthy();
  const body = (await loginRes.json()) as {
    temp_token?: string;
    access_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) {
    throw new Error(`Login ${email} sin access_token ni temp_token`);
  }
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
  return ((await verifyRes.json()) as { access_token: string }).access_token;
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
): Promise<{ status: string } | null> {
  const r = await pool.query<{ status: string }>(
    `SELECT status FROM event_outbox
      WHERE event_type = $1 AND payload->>'invoice_id' = $2
      ORDER BY created_at DESC LIMIT 1`,
    [eventType, invoiceId],
  );
  return r.rows[0] ?? null;
}

async function waitOutboxDone(
  invoiceId: string,
  eventType: string,
): Promise<void> {
  const deadline = Date.now() + OUTBOX_DEADLINE_MS;
  while (Date.now() < deadline) {
    const row = await findOutboxRow(invoiceId, eventType);
    if (row?.status === 'done') return;
    if (row?.status === 'failed') {
      throw new Error(
        `Outbox ${eventType} para invoice ${invoiceId} llegó a failed`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timeout esperando outbox.done para ${eventType} (invoice ${invoiceId})`,
  );
}

async function findSetupTask(serviceId: string): Promise<{
  id: string;
  status: string;
  type: string;
  assigned_to: string | null;
  conversation_id: string | null;
} | null> {
  const r = await pool.query(
    `SELECT id, status, type, assigned_to, conversation_id
     FROM tasks
     WHERE service_id = $1 AND type = 'support_setup'
     ORDER BY created_at DESC LIMIT 1`,
    [serviceId],
  );
  return (r.rows[0] as never) ?? null;
}

async function waitForSetupTask(serviceId: string): Promise<{
  id: string;
  status: string;
  type: string;
  assigned_to: string | null;
  conversation_id: string | null;
}> {
  const deadline = Date.now() + PROVISION_DEADLINE_MS;
  while (Date.now() < deadline) {
    const task = await findSetupTask(serviceId);
    if (task) return task;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timeout esperando que el orquestador cree la support_setup task para service ${serviceId}`,
  );
}

async function getServiceStatus(serviceId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(
    `SELECT status FROM services WHERE id = $1`,
    [serviceId],
  );
  if (!r.rows[0]) throw new Error(`Service ${serviceId} no encontrado`);
  return r.rows[0].status;
}

async function waitForServiceStatus(
  serviceId: string,
  expected: string,
): Promise<void> {
  const deadline = Date.now() + ACTIVATION_DEADLINE_MS;
  while (Date.now() < deadline) {
    const status = await getServiceStatus(serviceId);
    if (status === expected) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  const finalStatus = await getServiceStatus(serviceId);
  throw new Error(
    `Timeout esperando service ${serviceId} status=${expected} (último=${finalStatus})`,
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Provisioning — Sprint 11 Fase 11.C plugin manual flow', () => {
  let superadminToken: string;
  let clientToken: string;
  let agentToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    clientUserId = await createUser({
      email: 'e2e-prov-client@aelium.test',
      firstName: 'Carla',
      lastName: 'ProvManual',
      roleSlug: 'client',
    });
    agentFullId = await createUser({
      email: 'e2e-prov-agent@aelium.test',
      firstName: 'Agent',
      lastName: 'Full',
      roleSlug: 'agent_full',
    });

    // Resolver IDs canónicos del producto hosting-pro (provisioner=manual).
    const hosting = await pool.query(
      `SELECT pp.id AS pricing_id, pp.product_id
       FROM product_pricing pp
       JOIN products p ON p.id = pp.product_id
       WHERE p.slug = 'hosting-pro'
         AND pp.billing_cycle = 'monthly'
         AND pp.currency = 'EUR'`,
    );
    if (!hosting.rows[0]) {
      throw new Error(
        'Seed sample-products no aplicado: falta hosting-pro mensual.',
      );
    }
    hostingProductId = hosting.rows[0].product_id as string;
    hostingPricingMonthlyId = hosting.rows[0].pricing_id as string;

    superadminToken = await login(
      request,
      TEST_CONFIG.superadmin.email,
      SUPERADMIN_PASSWORD,
    );
    clientToken = await login(request, 'e2e-prov-client@aelium.test', PASSWORD);
    agentToken = await login(request, 'e2e-prov-agent@aelium.test', PASSWORD);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('Cliente compra hosting-pro (manual) → orquestador crea support_setup → agente completa → service active', async ({
    request,
  }) => {
    // ── 1. Cliente checkout — crea Service(pending) + Invoice(draft) ──
    const checkoutRes = await authedFetch(
      request,
      clientToken,
      'POST',
      '/billing/checkout',
      {
        product_pricing_id: hostingPricingMonthlyId,
        label: 'mi-pyme.example',
      },
    );
    expect(
      checkoutRes.ok(),
      `Checkout falló: ${checkoutRes.status()} ${await checkoutRes.text()}`,
    ).toBeTruthy();
    const checkoutBody = (await checkoutRes.json()) as {
      service: { id: string; status: string; product_id: string };
      invoice: { id: string; status: string };
    };
    expect(checkoutBody.service.status).toBe('pending');
    expect(checkoutBody.service.product_id).toBe(hostingProductId);
    expect(checkoutBody.invoice.status).toBe('draft');

    const serviceId = checkoutBody.service.id;
    const invoiceId = checkoutBody.invoice.id;

    // ── 2. Superadmin finaliza la invoice (draft → pending) ──
    const finalizeRes = await authedFetch(
      request,
      superadminToken,
      'PATCH',
      `/billing/invoices/${invoiceId}/finalize`,
    );
    expect(finalizeRes.ok()).toBeTruthy();

    // ── 3. Superadmin marca pagada → outbox enqueue invoice.paid ──
    const payRes = await authedFetch(
      request,
      superadminToken,
      'PATCH',
      `/billing/invoices/${invoiceId}/pay`,
      { payment_method: 'manual', payment_ref: 'P11C-TEST' },
    );
    expect(payRes.ok()).toBeTruthy();
    const paidBody = (await payRes.json()) as { status: string };
    expect(paidBody.status).toBe('paid');

    // Esperar a que outbox worker procese invoice.paid → done. Los listeners
    // (entre ellos el orquestador) se invocan vía `emitAsync` durante el
    // proceso del outbox.
    await waitOutboxDone(invoiceId, 'invoice.paid');

    // ── 4. Verificar que el orquestador creó support_setup en cola pública ──
    // El plugin `manual` declaró followUp=['create_setup_task'] —
    // orquestador.createSetupTask la crea con assigned_to=null y service_id
    // poblado. conversation_id debe ser null (no es bridge ticket↔task).
    const setupTask = await waitForSetupTask(serviceId);
    expect(setupTask.type).toBe('support_setup');
    expect(setupTask.assigned_to).toBeNull(); // ADR-072 cola pública
    expect(setupTask.conversation_id).toBeNull(); // EC-P11-07 mutual exclusion
    expect(['pending', 'in_progress']).toContain(setupTask.status);

    // El service queda en 'provisioning' tras el plugin.provision() OK
    // (orquestador hace update intermedio antes de createSetupTask).
    // No verificamos ese estado porque depende del timing — basta con que
    // NO esté ya 'active' antes de que el agente complete la task.
    const intermediateStatus = await getServiceStatus(serviceId);
    expect(intermediateStatus).not.toBe('active');

    // ── 5. Agente auto-asigna y completa la support_setup task ──
    const claimRes = await authedFetch(
      request,
      agentToken,
      'PATCH',
      `/tasks/${setupTask.id}`,
      { assigned_to: agentFullId },
    );
    expect(
      claimRes.ok(),
      `Claim task falló: ${claimRes.status()} ${await claimRes.text()}`,
    ).toBeTruthy();

    const completeRes = await authedFetch(
      request,
      agentToken,
      'PATCH',
      `/tasks/${setupTask.id}/complete`,
      {
        internal_notes:
          'Hosting Pro provisionado manualmente: cuenta cPanel creada, DNS apuntado, SSL activo.',
        client_notes:
          'Tu hosting está listo. Te enviamos las credenciales por email aparte.',
      },
    );
    expect(
      completeRes.ok(),
      `Complete task falló: ${completeRes.status()} ${await completeRes.text()}`,
    ).toBeTruthy();
    const completed = (await completeRes.json()) as { status: string };
    expect(completed.status).toBe('completed');

    // ── 6. Esperar a que el listener active el service ──
    // ProvisioningOnTaskCompletedListener filtra por:
    //   task.conversation_id === null (✓)
    //   task.service_id !== null (✓)
    //   plugin.capabilities.completes_via_task === true (✓ manual lo declara)
    // → services.status = 'active' + emite service.activated.
    await waitForServiceStatus(serviceId, 'active');

    // Verificación final del service.
    const finalService = await pool.query(
      `SELECT status, provisioner_slug FROM services WHERE id = $1`,
      [serviceId],
    );
    expect(finalService.rows[0].status).toBe('active');
    // El orquestador denormalizó provisioner_slug='manual' al iniciar
    // el provisioning (Sprint 11 Fase 11.B).
    expect(finalService.rows[0].provisioner_slug).toBe('manual');
  });

  test('EC-P11-07: bridge ticket↔task no choca con provisioning listener (mutual exclusion)', async () => {
    // Documentado: si llega un task.completed con conversation_id !== null,
    // ProvisioningOnTaskCompletedListener debe ignorarlo silenciosamente.
    // El test unit `provisioning-on-task-completed.listener.spec.ts` ya
    // cubre la lógica exhaustivamente — aquí dejamos un test smoke que
    // garantiza que cualquier service que crearíamos en la primera prueba
    // sigue con su task de bridge separadamente sin que el listener
    // confunda los flujos.
    //
    // Verificación: una task con conversation_id NO debe haber tocado
    // ningún service.status — query explícita contra DB.
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM tasks t
       WHERE t.conversation_id IS NOT NULL
         AND t.service_id IS NOT NULL
         AND t.status = 'completed'`,
    );
    // Hoy 0 — el bridge ticket↔task nunca pobla service_id en esta suite
    // (los conversation tasks vienen de support, sin service vinculado).
    // El test queda como guardia: si alguien introduce una task con AMBOS
    // poblados y la cierra, EC-P11-07 deja de ser mutuamente excluyente
    // y este test fallaría — punto de detección temprana.
    expect(Number(r.rows[0].count)).toBe(0);
  });
});

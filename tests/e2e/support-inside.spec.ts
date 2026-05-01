/**
 * E2E — Sprint 8 Fase D — Support Inside (ADR-034 + ADR-061 + ADR-075).
 *
 * Cobertura end-to-end:
 *   1. Cliente subscribe a Plan Pro → BillingCheckoutService crea Service +
 *      Invoice; SupportInsideSubscription persiste activa. Cliente añade
 *      slot a uno de sus servicios → MaintenanceMonthlyCron disparado
 *      manualmente → Task type=maintenance_management creada con
 *      assigned_to=null (cola pública ADR-072) y billing_month=YYYY-MM.
 *   2. Admin GET /admin/support-inside/plans → 3 filas (Básico/Medium/Pro)
 *      con su pricing mensual + anual.
 *   3. Admin PATCH /admin/support-inside/plans/support-inside-pro sección
 *      Precios → product_pricing.price actualizado, sin tocar el resto del
 *      plan. La subscription activa del cliente Pro NO se ve afectada
 *      (decisión consciente: cambio aplica a NUEVOS suscriptores).
 *   4. POST /admin/products con type=support_inside SIN header interno
 *      → 400 (defense in depth ADR-075 §A.2).
 *   5. Cliente intenta GET /admin/support-inside/plans → 403 (defense in
 *      depth: AdminOnlyGuard antes de CASL).
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const CLIENT_PASSWORD = 'TestPassword123!';

let pool: Pool;
let clientUserId: string;
let clientServiceId: string;
let proPlanId: string;
let proPricingMonthlyId: string;

async function loginSuperadminAPI(request: APIRequestContext): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
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
  expect(verifyRes.ok()).toBeTruthy();
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

async function loginClientAPI(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password: CLIENT_PASSWORD },
  });
  expect(
    loginRes.ok(),
    `Login cliente falló: ${loginRes.status()} ${await loginRes.text()}`,
  ).toBeTruthy();
  const body = (await loginRes.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('Cliente sin 2FA pero no llegó access_token');
  }
  return body.access_token;
}

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
  const passwordHash = await bcrypt.hash(CLIENT_PASSWORD, 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [opts.email, passwordHash, opts.firstName, opts.lastName, roleId],
  );
  return res.rows[0].id as string;
}

async function authedRequest(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
) {
  return request.fetch(`${TEST_CONFIG.apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(extraHeaders ?? {}),
    },
    data: body ? JSON.stringify(body) : undefined,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Support Inside — Sprint 8 Fase D', () => {
  let superadminToken: string;
  let clientToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    clientUserId = await createUser({
      email: 'e2e-si-client@aelium.test',
      firstName: 'Cliente',
      lastName: 'SI',
      roleSlug: 'client',
    });

    // Hosting Pro seedeado (sample-products) — usamos su pricing mensual
    // para crear un service del cliente al que asignar el slot.
    const hosting = await pool.query(
      `SELECT pp.id AS pricing_id, pp.product_id
       FROM product_pricing pp
       JOIN products p ON p.id = pp.product_id
       WHERE p.slug = 'hosting-pro' AND pp.billing_cycle = 'monthly' AND pp.currency = 'EUR'`,
    );
    if (!hosting.rows[0]) {
      throw new Error(
        'Seed sample-products no aplicado: falta hosting-pro mensual.',
      );
    }
    const hostingProductId = hosting.rows[0].product_id as string;

    // Crear service hosting del cliente (status=active para el slot).
    const svc = await pool.query(
      `INSERT INTO services (user_id, product_id, status, label, billing_cycle, amount, currency)
       VALUES ($1, $2, 'active', 'mi-web.com', 'monthly', 12.00, 'EUR')
       RETURNING id`,
      [clientUserId, hostingProductId],
    );
    clientServiceId = svc.rows[0].id as string;

    // Resolver IDs canónicos del Plan Pro seedeado.
    const proPlan = await pool.query(
      `SELECT p.id AS product_id, pp.id AS pricing_id, pp.price
       FROM products p
       JOIN product_pricing pp ON pp.product_id = p.id
       WHERE p.slug = 'support-inside-pro' AND pp.billing_cycle = 'monthly'`,
    );
    if (!proPlan.rows[0]) {
      throw new Error(
        'Seed support-inside-plans no aplicado: falta support-inside-pro mensual.',
      );
    }
    proPlanId = proPlan.rows[0].product_id as string;
    proPricingMonthlyId = proPlan.rows[0].pricing_id as string;

    superadminToken = await loginSuperadminAPI(request);
    clientToken = await loginClientAPI(request, 'e2e-si-client@aelium.test');
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('Cliente subscribe Plan Pro → checkout → addSlot → MaintenanceMonthlyCron crea task', async ({
    request,
  }) => {
    // 1. Subscribe — checkout reusa BillingCheckoutService (ADR-061).
    const subRes = await authedRequest(
      request,
      clientToken,
      'POST',
      '/dashboard/support-inside/subscribe',
      { product_pricing_id: proPricingMonthlyId },
    );
    expect(
      subRes.ok(),
      `Subscribe falló: ${subRes.status()} ${await subRes.text()}`,
    ).toBeTruthy();
    const subBody = (await subRes.json()) as {
      subscription: { id: string; client_id: string };
      service: { id: string };
      invoice: { id: string };
    };
    expect(subBody.subscription.client_id).toBe(clientUserId);
    expect(subBody.invoice.id).toBeTruthy();

    // 2. addSlot — slot de tipo maintenance_management (Pro lo permite)
    //    sobre el service hosting del cliente.
    const slotRes = await authedRequest(
      request,
      clientToken,
      'POST',
      '/dashboard/support-inside/slots',
      {
        service_id: clientServiceId,
        slot_type: 'maintenance_management',
      },
    );
    expect(
      slotRes.ok(),
      `addSlot falló: ${slotRes.status()} ${await slotRes.text()}`,
    ).toBeTruthy();

    // 3. Disparar MaintenanceMonthlyCron manualmente (endpoint admin).
    const cronRes = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/support-inside/cron/maintenance-monthly',
    );
    expect(cronRes.ok()).toBeTruthy();
    const cronBody = (await cronRes.json()) as {
      cron: string;
      result: { candidates: number; created: number; billing_month: string };
    };
    expect(cronBody.cron).toBe('maintenance-monthly');
    expect(cronBody.result.candidates).toBeGreaterThanOrEqual(1);
    expect(cronBody.result.created).toBeGreaterThanOrEqual(1);

    // 4. Verificar Task creada con shape canónico.
    const tasksQ = await pool.query(
      `SELECT type, status, assigned_to, billing_month, service_id, metadata
       FROM tasks
       WHERE service_id = $1 AND type = 'maintenance_management'
       ORDER BY created_at DESC LIMIT 1`,
      [clientServiceId],
    );
    expect(tasksQ.rowCount).toBe(1);
    const task = tasksQ.rows[0];
    expect(task.type).toBe('maintenance_management');
    expect(task.status).toBe('pending');
    expect(task.assigned_to).toBeNull(); // ADR-072 cola pública
    expect(task.billing_month).toBe(cronBody.result.billing_month);
    expect(task.metadata.source).toBe('support_inside_monthly_cron');

    // 5. Re-disparar cron → idempotencia (skipped_idempotent +=1).
    const cron2 = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/support-inside/cron/maintenance-monthly',
    );
    const cron2Body = (await cron2.json()) as {
      result: { created: number; skipped_idempotent: number };
    };
    expect(cron2Body.result.created).toBe(0);
    expect(cron2Body.result.skipped_idempotent).toBeGreaterThanOrEqual(1);
  });

  test('Admin GET /admin/support-inside/plans → 3 filas con pricing mensual+anual', async ({
    request,
  }) => {
    const res = await authedRequest(
      request,
      superadminToken,
      'GET',
      '/admin/support-inside/plans',
    );
    expect(res.ok()).toBeTruthy();
    const plans = (await res.json()) as Array<{
      slug: string;
      pricing_monthly: string | null;
      pricing_yearly: string | null;
    }>;
    // Tras la migración cleanup `sprint8d_cleanup_legacy_support_inside_basic`
    // (Sprint 8 Fase D), la BD sólo tiene los 3 planes canónicos.
    expect(plans.length).toBe(3);
    const slugs = plans.map((p) => p.slug).sort();
    expect(slugs).toEqual([
      'support-inside-basico',
      'support-inside-medium',
      'support-inside-pro',
    ]);
    for (const plan of plans) {
      expect(plan.pricing_monthly).not.toBeNull();
      expect(plan.pricing_yearly).not.toBeNull();
    }
  });

  test('Admin PATCH /admin/support-inside/plans/support-inside-pro Precios → pricing actualizado', async ({
    request,
  }) => {
    const newPrice = '85.00';
    const res = await authedRequest(
      request,
      superadminToken,
      'PATCH',
      '/admin/support-inside/plans/support-inside-pro',
      { pricing: { monthly: { price: Number(newPrice) } } },
    );
    expect(
      res.ok(),
      `PATCH plan falló: ${res.status()} ${await res.text()}`,
    ).toBeTruthy();

    // Verificar en BD que el pricing canónico cambió.
    const updated = await pool.query(
      `SELECT price FROM product_pricing
       WHERE product_id = $1 AND billing_cycle = 'monthly' AND currency = 'EUR'`,
      [proPlanId],
    );
    expect(updated.rows[0].price.toString()).toBe(newPrice);
  });

  test('POST /admin/products type=support_inside SIN header interno → 400 (ADR-075 §A.2)', async ({
    request,
  }) => {
    const res = await authedRequest(
      request,
      superadminToken,
      'POST',
      '/admin/products',
      {
        slug: 'support-inside-cuarto-plan',
        name: 'Cuarto plan',
        type: 'support_inside',
      },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/support-inside-plans|ADR-075/);
  });

  test('Cliente recibe 403 al intentar GET /admin/support-inside/plans (defense in depth: AdminOnlyGuard)', async ({
    request,
  }) => {
    const res = await authedRequest(
      request,
      clientToken,
      'GET',
      '/admin/support-inside/plans',
    );
    expect(res.status()).toBe(403);
  });
});

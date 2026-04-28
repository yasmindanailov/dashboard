/**
 * E2E — Sprint 9.6 Fase F.3: granularidad CASL por rol staff
 * (DC.7 + ADR-067).
 *
 * Cierra deuda Sprint 9.5 §3 ("granularidad fina diferida a 9.6").
 * Verifica que cada rol staff ve y puede ejecutar SOLO el subset
 * declarado en `backend/src/core/casl/permissions.ts` y replicado en
 * `frontend/app/lib/permissions.ts`. La matriz de visibilidad
 * (Sprint 9.6 §3) es:
 *
 *   superadmin       → todo
 *   agent_full       → todo excepto Setting / NotificationTemplate / Job
 *   agent_billing    → Clientes + BillingProfile + Invoice + Task
 *                      (NO Conversation, NO Product, NO Setting...)
 *   agent_support    → Clientes(read) + Conversation + Task + KB(read)
 *                      (NO Invoice, NO Product, NO Setting...)
 *
 * Cobertura mínima:
 *
 *   1. agent_billing recibe 403 sobre /api/v1/support/conversations
 *      (CASL no le da Read.Conversation).
 *   2. agent_support recibe 403 sobre /api/v1/billing/invoices
 *      (CASL no le da Read.Invoice).
 *   3. superadmin accede a /api/v1/admin/notifications/templates;
 *      agent_full recibe 403 (Subjects nuevos ADR-067).
 *   4. superadmin accede a /api/v1/admin/jobs/failed; agent_full 403.
 *
 * Las cuentas demo del seed (Sprint 9.6 Fase F.0) están sembradas
 * con una credencial conocida por rol — ver
 * `docs/50-operations/seed-reference.md`.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import {
  clearMailbox,
  waitForEmail,
  extract2FACode,
} from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

const STAFF_ACCOUNTS = {
  agent_full: {
    email: 'agent.full@aelium.test',
    password: process.env.SEED_AGENT_FULL_PASSWORD || 'AgentFull2026!',
  },
  agent_billing: {
    email: 'agent.billing@aelium.test',
    password: process.env.SEED_AGENT_BILLING_PASSWORD || 'AgentBilling2026!',
  },
  agent_support: {
    email: 'agent.support@aelium.test',
    password: process.env.SEED_AGENT_SUPPORT_PASSWORD || 'AgentSupport2026!',
  },
} as const;

const tokens: Record<string, string> = {};

async function login2FAStaff(
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
    `Login ${email} falló: ${loginRes.status()}`,
  ).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
    requires_2fa?: boolean;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) {
    throw new Error(`${email}: falta access_token y temp_token`);
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
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

test.describe.serial('Granularidad CASL por rol staff (ADR-067)', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestData();
    // Login secuencial: cada uno limpia MailPit y espera SU código 2FA.
    tokens.superadmin = await login2FAStaff(
      request,
      TEST_CONFIG.superadmin.email,
      SUPERADMIN_PASSWORD,
    );
    tokens.agent_full = await login2FAStaff(
      request,
      STAFF_ACCOUNTS.agent_full.email,
      STAFF_ACCOUNTS.agent_full.password,
    );
    tokens.agent_billing = await login2FAStaff(
      request,
      STAFF_ACCOUNTS.agent_billing.email,
      STAFF_ACCOUNTS.agent_billing.password,
    );
    tokens.agent_support = await login2FAStaff(
      request,
      STAFF_ACCOUNTS.agent_support.email,
      STAFF_ACCOUNTS.agent_support.password,
    );
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     1. agent_billing NO puede leer Conversations
     ════════════════════════════════════════════════════════════════ */

  test('agent_billing → 403 sobre GET /api/v1/support/conversations/stats', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/support/conversations/stats?type=ticket`,
      { headers: { Authorization: `Bearer ${tokens.agent_billing}` } },
    );
    expect(res.status()).toBe(403);
  });

  test('agent_billing → 200 sobre GET /api/v1/billing/invoices (su scope)', async ({
    request,
  }) => {
    // Validación positiva del scope: agent_billing SÍ puede leer
    // facturas. Si esto fallara, la matriz CASL estaría rota.
    const res = await request.get(`${TEST_CONFIG.apiUrl}/billing/invoices`, {
      headers: { Authorization: `Bearer ${tokens.agent_billing}` },
    });
    expect(res.status()).toBe(200);
  });

  /* ════════════════════════════════════════════════════════════════
     2. agent_support NO puede leer Invoices
     ════════════════════════════════════════════════════════════════ */

  test('agent_support → 403 sobre GET /api/v1/billing/invoices', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/billing/invoices`, {
      headers: { Authorization: `Bearer ${tokens.agent_support}` },
    });
    expect(res.status()).toBe(403);
  });

  test('agent_support → 200 sobre GET /api/v1/support/tickets (su scope)', async ({
    request,
  }) => {
    // Validación positiva del scope: agent_support SÍ puede listar
    // tickets. Sin esto la matriz estaría invertida.
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/support/tickets?type=ticket&page=1&limit=20`,
      { headers: { Authorization: `Bearer ${tokens.agent_support}` } },
    );
    expect(res.status()).toBe(200);
  });

  /* ════════════════════════════════════════════════════════════════
     3. NotificationTemplate (Subject ADR-067) — solo superadmin
     ════════════════════════════════════════════════════════════════ */

  test('superadmin → 200 sobre GET /api/v1/admin/notifications/templates', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/notifications/templates`,
      { headers: { Authorization: `Bearer ${tokens.superadmin}` } },
    );
    expect(res.status()).toBe(200);
  });

  test('agent_full → 403 sobre GET /api/v1/admin/notifications/templates', async ({
    request,
  }) => {
    // ADR-067: Subject.NotificationTemplate solo lo tiene superadmin
    // vía regla wildcard `Manage All`. agent_full pasa AdminOnlyGuard
    // pero falla en PoliciesGuard.
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/notifications/templates`,
      { headers: { Authorization: `Bearer ${tokens.agent_full}` } },
    );
    expect(res.status()).toBe(403);
  });

  /* ════════════════════════════════════════════════════════════════
     4. Job (Subject ADR-067) — solo superadmin
     ════════════════════════════════════════════════════════════════ */

  test('superadmin → 200 sobre GET /api/v1/admin/jobs/failed', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/jobs/failed`,
      { headers: { Authorization: `Bearer ${tokens.superadmin}` } },
    );
    expect(res.status()).toBe(200);
  });

  test('agent_full → 403 sobre GET /api/v1/admin/jobs/failed', async ({
    request,
  }) => {
    // ADR-067: Subject.Job solo superadmin (DLQ retry re-ejecuta side
    // effects — debe estar centralizado en el rol con visión global).
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/jobs/failed`,
      { headers: { Authorization: `Bearer ${tokens.agent_full}` } },
    );
    expect(res.status()).toBe(403);
  });
});

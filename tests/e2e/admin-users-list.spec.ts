/**
 * E2E — Sprint 8 Fase A.4: endpoint listar agentes asignables.
 *
 * Verifica `GET /api/v1/admin/users` (Sprint 8 Fase A.3 — UsersController).
 * Endpoint consumido por NewTaskModal (Sprint 8 Fase B) para resolver el
 * selector de asignación de tareas.
 *
 * Cobertura:
 *
 *   1. Sin auth → 401 (JwtAuthGuard).
 *   2. Cliente autenticado → 403 (AdminOnlyGuard corte temprano).
 *   3. agent_full → 200, recibe los 4 agentes seed (superadmin + 3 agentes)
 *      con shape `{ data: AgentListItemDto[], meta: PaginationMeta }`.
 *   4. agent_billing → 200, mismo shape (CASL `Read.Agent` permitido a los
 *      3 staff non-superadmin tras Sprint 8 Fase A.3a).
 *   5. agent_support → 200, mismo shape.
 *   6. Filtro `?role=agent_full` → 200, sólo retorna agente del rol pedido.
 *   7. Filtro `?role=client` (rol no asignable) → resultado vacío + meta.total=0
 *      (defense-in-depth: el service intersecta con `ASSIGNABLE_ROLE_SLUGS`).
 *   8. Filtro `?search=full` → 200, retorna sólo `agent.full@aelium.test`.
 *
 * Cuentas seed (Sprint 9.6 Fase F.0): ver
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

const ACCOUNTS = {
  agent_full: {
    email: 'agent.full@aelium.test',
    password: process.env.SEED_AGENT_FULL_PASSWORD || 'AgentFull2026!',
  },
  agent_billing: {
    email: 'agent.billing@aelium.test',
    password:
      process.env.SEED_AGENT_BILLING_PASSWORD || 'AgentBilling2026!',
  },
  agent_support: {
    email: 'agent.support@aelium.test',
    password:
      process.env.SEED_AGENT_SUPPORT_PASSWORD || 'AgentSupport2026!',
  },
  client: {
    email: 'cliente@aelium.test',
    password: process.env.SEED_CLIENT_PASSWORD || 'Cliente2026!',
  },
} as const;

const tokens: Record<string, string> = {};

interface AgentListItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  status: string;
  avatar_url: string | null;
}

interface PaginatedAgents {
  data: AgentListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

async function login2FA(
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

async function loginClient(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  // Cliente no tiene 2FA forzado (sólo superadmin). Si en el seed el
  // cliente tampoco lo activa, el login devuelve access_token directo.
  const res = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(
    res.ok(),
    `Login cliente ${email} falló: ${res.status()}`,
  ).toBeTruthy();
  const body = (await res.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  // Fallback: si el seed activase 2FA al cliente, reusa el helper completo.
  return login2FA(request, email, password);
}

test.describe.serial('Sprint 8 Fase A — admin/users (listar agentes)', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestData();
    tokens.superadmin = await login2FA(
      request,
      TEST_CONFIG.superadmin.email,
      SUPERADMIN_PASSWORD,
    );
    tokens.agent_full = await login2FA(
      request,
      ACCOUNTS.agent_full.email,
      ACCOUNTS.agent_full.password,
    );
    tokens.agent_billing = await login2FA(
      request,
      ACCOUNTS.agent_billing.email,
      ACCOUNTS.agent_billing.password,
    );
    tokens.agent_support = await login2FA(
      request,
      ACCOUNTS.agent_support.email,
      ACCOUNTS.agent_support.password,
    );
    tokens.client = await loginClient(
      request,
      ACCOUNTS.client.email,
      ACCOUNTS.client.password,
    );
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     1. Auth + Guard
     ════════════════════════════════════════════════════════════════ */

  test('sin auth → 401', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/users`);
    expect(res.status()).toBe(401);
  });

  test('cliente → 403 (AdminOnlyGuard)', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${tokens.client}` },
    });
    expect(res.status()).toBe(403);
  });

  /* ════════════════════════════════════════════════════════════════
     2. Staff: los 4 roles staff pueden leer (CASL Read.Agent)
     ════════════════════════════════════════════════════════════════ */

  test('superadmin → 200 + 4 agentes staff', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${tokens.superadmin}` },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as PaginatedAgents;
    expect(body.meta.total).toBeGreaterThanOrEqual(4);
    const roles = body.data.map((u) => u.role);
    expect(roles).toEqual(
      expect.arrayContaining([
        'superadmin',
        'agent_full',
        'agent_billing',
        'agent_support',
      ]),
    );
    // Cliente NO debe aparecer (defense-in-depth ASSIGNABLE_ROLE_SLUGS).
    expect(roles).not.toContain('client');
    // Shape canónico
    for (const u of body.data) {
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('email');
      expect(u).toHaveProperty('full_name');
      expect(u).toHaveProperty('role');
      expect(u).toHaveProperty('status', 'active');
    }
  });

  test('agent_full → 200 (Read.Agent permitido)', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${tokens.agent_full}` },
    });
    expect(res.status()).toBe(200);
  });

  test('agent_billing → 200 (Read.Agent permitido)', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${tokens.agent_billing}` },
    });
    expect(res.status()).toBe(200);
  });

  test('agent_support → 200 (Read.Agent permitido)', async ({ request }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${tokens.agent_support}` },
    });
    expect(res.status()).toBe(200);
  });

  /* ════════════════════════════════════════════════════════════════
     3. Filtros
     ════════════════════════════════════════════════════════════════ */

  test('?role=agent_full → solo agent_full', async ({ request }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/users?role=agent_full`,
      { headers: { Authorization: `Bearer ${tokens.superadmin}` } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as PaginatedAgents;
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((u) => u.role === 'agent_full')).toBe(true);
  });

  test('?role=client → 400 (rol no asignable, IsEnum filtra)', async ({
    request,
  }) => {
    // `client` está en RoleSlug pero NO en ASSIGNABLE_ROLE_SLUGS.
    // El IsEnum del DTO acepta cualquier RoleSlug; el service intersecta
    // con la lista permitida. Resultado: 0 datos, no 400.
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/users?role=client`,
      { headers: { Authorization: `Bearer ${tokens.superadmin}` } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as PaginatedAgents;
    expect(body.meta.total).toBe(0);
    expect(body.data).toHaveLength(0);
  });

  test('?search=full → matchea agent.full@aelium.test', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/users?search=full`,
      { headers: { Authorization: `Bearer ${tokens.superadmin}` } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as PaginatedAgents;
    const emails = body.data.map((u) => u.email);
    expect(emails).toContain('agent.full@aelium.test');
  });
});

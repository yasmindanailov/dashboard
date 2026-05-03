/**
 * E2E — Sprint 8 Fase B.1.bis: edge cases críticos del módulo tasks.
 *
 * Cubre los 4 fixes implementados tras la auditoría rigurosa de edge
 * cases (`docs/60-roadmap/current.md` §6 — EC-T8-19/20/21/22) y la
 * actualización doctrinal vía [ADR-072](docs/10-decisions/adr-072-tareas-sin-asignar-cola-publica.md):
 *
 *   1. EC-T8-19  status no admite transición desde estados terminales.
 *   2. EC-T8-20  `assigned_to` no se puede cambiar en task cerrada.
 *   3. EC-T8-21  `priority` no se puede cambiar en task cerrada.
 *   4. EC-T8-22  Auto-asignación: staff no admin puede tomar una tarea
 *               de la cola pública (ADR-072).
 *
 * Spec aislado del `tasks.spec.ts` original (P0.1) para que los fixes
 * sean reversibles atómicamente sin tocar el cierre mínimo de Sprint 8.
 *
 * Convenciones del proyecto: workers=1 + fullyParallel=false (DC.13);
 * cada spec hace su `resetTestData()` en beforeAll.
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
import { insertTask } from './fixtures/tasks';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;
let agentSupportId: string;
let agentBillingId: string;
let clientUserId: string;
let agentSupportToken: string;
let agentBillingToken: string;

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

test.describe.configure({ mode: 'serial' });

test.describe('Tasks — edge cases EC-T8-19/20/21/22 (Sprint 8 Fase B.1.bis)', () => {
  let superadminToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    agentSupportId = await createUser({
      email: 'e2e-edge-support@aelium.test',
      firstName: 'Sergio',
      lastName: 'Edge',
      roleSlug: 'agent_support',
    });
    agentBillingId = await createUser({
      email: 'e2e-edge-billing@aelium.test',
      firstName: 'Berta',
      lastName: 'Edge',
      roleSlug: 'agent_billing',
    });
    clientUserId = await createUser({
      email: 'e2e-edge-client@aelium.test',
      firstName: 'Cesar',
      lastName: 'Edge',
      roleSlug: 'client',
    });

    superadminToken = await loginSuperadmin(request);
    agentSupportToken = await login2FA(
      request,
      'e2e-edge-support@aelium.test',
      'TestPassword123!',
    );
    agentBillingToken = await login2FA(
      request,
      'e2e-edge-billing@aelium.test',
      'TestPassword123!',
    );
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     EC-T8-19: completar dos veces bloqueado
     Sprint 16 (ADR-079): la API no expone PATCH libre de status. La
     transición a estados terminales (completed/cancelled) ocurre vía
     /complete, /complete-ticket-bridge o /cancel — y todas rechazan si
     la task ya está cerrada.
     ════════════════════════════════════════════════════════════════ */

  test('EC-T8-19 — completar una task ya completed devuelve 400', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    const firstClose = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      { note: 'Cerrada para test EC-T8-19' },
    );
    expect(
      firstClose.ok(),
      `first complete: ${firstClose.status()} ${await firstClose.text()}`,
    ).toBeTruthy();

    const secondClose = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/complete`,
      { note: 'Reintento — debe fallar' },
    );
    expect(secondClose.status()).toBe(400);
    const body = (await secondClose.json()) as { message: string };
    expect(body.message.toLowerCase()).toMatch(/cerrada|completed/);
  });

  /* ════════════════════════════════════════════════════════════════
     EC-T8-20: reasignar tarea cerrada bloqueado
     ════════════════════════════════════════════════════════════════ */

  test('EC-T8-20 — task completada no admite cambio de assigned_to', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    await authed(request, superadminToken, 'PATCH', `/tasks/${taskId}/complete`, {
      note: 'cerrada',
    });

    const reassignRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/assign`,
      { assigned_to: agentBillingId },
    );
    expect(reassignRes.status()).toBe(400);
    const body = (await reassignRes.json()) as { message: string };
    expect(body.message.toLowerCase()).toMatch(/cerrada|completed|reasignar/);
  });

  /* ════════════════════════════════════════════════════════════════
     EC-T8-21: ELIMINADO en Sprint 13.5 Fase C (DC.34) — el endpoint
     PATCH /tasks/:id/cancel se eliminó físicamente del controller en
     este sprint. La cancelación es consecuencia mecánica de listeners
     cross-sistema, NO operación HTTP humana. La inmutabilidad de
     terminales sigue cubierta por TASK-INV-2 a nivel `service.cancel()`
     y se ejercita indirectamente vía los listeners (test "desasignar
     ticket → cancela task bridge" cubre el camino canónico).
     ════════════════════════════════════════════════════════════════ */

  /* ════════════════════════════════════════════════════════════════
     EC-T8-22: auto-asignación desde cola pública (ADR-072)
     ════════════════════════════════════════════════════════════════ */

  test('EC-T8-22a — agent_support se auto-asigna una task sin owner', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'project',
      client_id: clientUserId,
      assigned_to: null, // cola pública
      priority: 'medium',
    });

    const claimRes = await authed(
      request,
      agentSupportToken,
      'PATCH',
      `/tasks/${taskId}/assign`,
      { assigned_to: agentSupportId },
    );
    expect(
      claimRes.ok(),
      `Auto-claim falló: ${claimRes.status()} ${await claimRes.text()}`,
    ).toBeTruthy();
    const claimed = (await claimRes.json()) as {
      assigned_to: string;
      status: string;
    };
    expect(claimed.assigned_to).toBe(agentSupportId);
    expect(claimed.status).toBe('in_progress');
  });

  test('EC-T8-22b — agent NO puede auto-asignarse una task de OTRO agente', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'provisioning_manual',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    const stealRes = await authed(
      request,
      agentBillingToken,
      'PATCH',
      `/tasks/${taskId}/assign`,
      { assigned_to: agentBillingId },
    );
    expect(stealRes.status()).toBe(403);
  });

  test('EC-T8-22c — admin pleno reasigna sin restricción', async ({
    request,
  }) => {
    const taskId = await insertTask(pool, {
      source_system: 'client_lifecycle',
      client_id: clientUserId,
      assigned_to: agentSupportId,
      priority: 'medium',
    });

    const reassignRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${taskId}/assign`,
      { assigned_to: agentBillingId },
    );
    expect(reassignRes.ok()).toBeTruthy();
    const reassigned = (await reassignRes.json()) as { assigned_to: string };
    expect(reassigned.assigned_to).toBe(agentBillingId);
  });
});

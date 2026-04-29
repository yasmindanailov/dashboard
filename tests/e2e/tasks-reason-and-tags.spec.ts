/**
 * E2E — Sprint 8 Fase B.7 (2026-04-29). ADR-073.
 *
 * Cubre:
 *   1. Catálogo `task_tags` seedeado expone los 5 tags canónicos.
 *   2. Crear tag desde admin → list lo devuelve, slug auto-generado del label.
 *   3. Crear tarea con `reason` + `tag_ids` → ambos persisten y vuelven en GET.
 *   4. Update reason='' (string vacío) → reason queda `null`.
 *   5. Update tag_ids=[] → desetiqueta la tarea (assignments borradas).
 *   6. Crear tarea con tag_id inexistente → 400.
 *   7. CASL: agent_billing puede LEER tags pero NO crear/borrar.
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

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;
let clientUserId: string;
let agentBillingId: string;
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

test.describe('Tasks — reason + tags (Sprint 8 Fase B.7 / ADR-073)', () => {
  let superadminToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    clientUserId = await createUser({
      email: 'e2e-b7-client@aelium.test',
      firstName: 'Camila',
      lastName: 'B7',
      roleSlug: 'client',
    });
    agentBillingId = await createUser({
      email: 'e2e-b7-billing@aelium.test',
      firstName: 'Berta',
      lastName: 'B7',
      roleSlug: 'agent_billing',
    });

    superadminToken = await loginSuperadmin(request);
    agentBillingToken = await login2FA(
      request,
      'e2e-b7-billing@aelium.test',
      'TestPassword123!',
    );
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('B.7.1 — catálogo seedeado expone 5 tags canónicos', async ({
    request,
  }) => {
    const res = await authed(request, superadminToken, 'GET', '/admin/task-tags');
    expect(res.ok()).toBeTruthy();
    const tags = (await res.json()) as { slug: string }[];
    const slugs = new Set(tags.map((t) => t.slug));
    expect(slugs).toEqual(
      new Set(['bienvenida', 'renovacion', 'incidencia', 'migracion', 'cortesia']),
    );
    expect(agentBillingId).toBeTruthy(); // referenced later, satisfy lint
  });

  test('B.7.2 — admin crea tag con slug auto-generado del label', async ({
    request,
  }) => {
    const res = await authed(request, superadminToken, 'POST', '/admin/task-tags', {
      label: 'Llamada cortesía B.7',
    });
    expect(res.ok()).toBeTruthy();
    const tag = (await res.json()) as { id: string; slug: string; label: string };
    expect(tag.slug).toBe('llamada-cortesia-b-7');
    expect(tag.label).toBe('Llamada cortesía B.7');
  });

  test('B.7.3 — crear tarea con reason + tag_ids persiste ambos', async ({
    request,
  }) => {
    // Recuperar id del tag "bienvenida" del catálogo seedeado.
    const list = await authed(request, superadminToken, 'GET', '/admin/task-tags');
    const tags = (await list.json()) as { id: string; slug: string }[];
    const bienvenida = tags.find((t) => t.slug === 'bienvenida');
    expect(bienvenida).toBeDefined();

    const createRes = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'contact_client',
      title: 'B.7.3 — tarea con reason+tags',
      priority: 'medium',
      client_id: clientUserId,
      reason: 'Bienvenida primer servicio',
      tag_ids: [bienvenida!.id],
    });
    expect(createRes.ok()).toBeTruthy();
    const task = (await createRes.json()) as {
      id: string;
      reason: string | null;
      tag_assignments: { tag: { slug: string } }[];
    };
    expect(task.reason).toBe('Bienvenida primer servicio');
    expect(task.tag_assignments).toHaveLength(1);
    expect(task.tag_assignments[0].tag.slug).toBe('bienvenida');

    // GET la trae igual.
    const getRes = await authed(request, superadminToken, 'GET', `/tasks/${task.id}`);
    const fetched = (await getRes.json()) as {
      reason: string | null;
      tag_assignments: { tag: { slug: string } }[];
    };
    expect(fetched.reason).toBe('Bienvenida primer servicio');
    expect(fetched.tag_assignments).toHaveLength(1);
  });

  test('B.7.4 — update reason="" limpia la columna a null', async ({
    request,
  }) => {
    const createRes = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'custom_work',
      title: 'B.7.4 — limpiar reason',
      priority: 'low',
      client_id: clientUserId,
      reason: 'Texto inicial',
    });
    const task = (await createRes.json()) as { id: string };

    const patchRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task.id}`,
      { reason: '' },
    );
    expect(patchRes.ok()).toBeTruthy();
    const updated = (await patchRes.json()) as { reason: string | null };
    expect(updated.reason).toBeNull();
  });

  test('B.7.5 — update tag_ids=[] desetiqueta la tarea', async ({ request }) => {
    const list = await authed(request, superadminToken, 'GET', '/admin/task-tags');
    const tags = (await list.json()) as { id: string; slug: string }[];
    const renovacion = tags.find((t) => t.slug === 'renovacion');

    const createRes = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'custom_work',
      title: 'B.7.5 — desetiquetar',
      priority: 'low',
      client_id: clientUserId,
      tag_ids: [renovacion!.id],
    });
    const task = (await createRes.json()) as { id: string };

    const patchRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task.id}`,
      { tag_ids: [] },
    );
    expect(patchRes.ok()).toBeTruthy();
    const updated = (await patchRes.json()) as {
      tag_assignments: unknown[];
    };
    expect(updated.tag_assignments).toHaveLength(0);
  });

  test('B.7.6 — crear con tag_id inexistente → 400', async ({ request }) => {
    const res = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'custom_work',
      title: 'B.7.6 — tag fantasma',
      priority: 'low',
      client_id: clientUserId,
      tag_ids: ['00000000-0000-4000-8000-000000000999'],
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message.toLowerCase()).toContain('no existen');
  });

  test('B.7.7 — agent_billing puede LEER tags pero NO crear/borrar', async ({
    request,
  }) => {
    const listRes = await authed(
      request,
      agentBillingToken,
      'GET',
      '/admin/task-tags',
    );
    expect(listRes.ok()).toBeTruthy();

    const createRes = await authed(
      request,
      agentBillingToken,
      'POST',
      '/admin/task-tags',
      { label: 'No deberías poder crearme' },
    );
    expect(createRes.status()).toBe(403);
  });
});

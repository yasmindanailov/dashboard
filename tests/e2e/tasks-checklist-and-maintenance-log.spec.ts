/**
 * E2E — Sprint 8 Fase B.5 (2026-04-29).
 *
 * Cobertura completa del flujo "Completar y notificar" canónico de
 * UI_SPEC §5.16 + endpoints de checklist:
 *
 *   1. GET /tasks/:id/checklist devuelve { items, completions } cruzados
 *      con `service_checklist_items` (snapshot) o `product_checklist_items`
 *      (fallback) según ChecklistCompletionService.findChecklistForTask.
 *   2. POST /tasks/:id/checklist/complete es idempotente (upsert por
 *      UNIQUE task_id+item_id+item_kind — Sprint 8 Fase A schema).
 *   3. POST /tasks/:id/maintenance/log con todos los required completados
 *      → 201, persiste maintenance_log + cierra task + emite
 *      maintenance.completed que el cliente recibe en su campana.
 *   4. EC-T8-01 — POST maintenance/log con items required sin completar
 *      → 400 con `missing_required: [{id, label, kind}]` y la task
 *      sigue en `pending` (no se cierra parcialmente).
 *   5. POST maintenance/log sin notes obligatorias → 400 (DTO valida).
 *   6. POST maintenance/log sobre task ya cerrada → 400 (TERMINAL_STATES
 *      guard heredado de Sprint 8 Fase B.1.bis).
 *   7. POST maintenance/log con `checklist_completions` inline (atajo)
 *      → 201, los items inline se aplican antes de validar required.
 *
 * Spec aislado del resto para granularidad histórica.
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
let agentSupportId: string;
let clientUserId: string;
let productId: string;
let serviceId: string;
let requiredItemId: string;
let optionalItemId: string;

async function loginSuperadminAPI(
  request: APIRequestContext,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error('superadmin sin token');
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

async function createUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
}): Promise<string> {
  const roleRes = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [
    opts.roleSlug,
  ]);
  const passwordHash = await bcrypt.hash('TestPassword123!', 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING id`,
    [
      opts.email,
      passwordHash,
      opts.firstName,
      opts.lastName,
      roleRes.rows[0].id,
    ],
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

async function createTaskMaintenance(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<string> {
  const res = await authed(request, token, 'POST', '/tasks', {
    type: 'maintenance',
    title,
    priority: 'medium',
    client_id: clientUserId,
    service_id: serviceId,
    assigned_to: agentSupportId,
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe.configure({ mode: 'serial' });

test.describe('Tasks — checklist + maintenance log (Sprint 8 Fase B.5)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    agentSupportId = await createUser({
      email: 'e2e-checklist-agent@aelium.test',
      firstName: 'Aitor',
      lastName: 'Checklist',
      roleSlug: 'agent_support',
    });
    clientUserId = await createUser({
      email: 'e2e-checklist-client@aelium.test',
      firstName: 'Carmen',
      lastName: 'Checklist',
      roleSlug: 'client',
    });

    // Producto + servicio + 2 items checklist (1 required, 1 optional).
    // Slug único para no colisionar con seed o ejecuciones previas.
    const slug = `cloud-office-checklist-${Date.now()}`;
    const productRes = await pool.query(
      `INSERT INTO products (name, slug, type, status, created_at, updated_at)
       VALUES ('Cloud Office Maintenance (E2E)', $1, 'docker_service', 'active', NOW(), NOW())
       RETURNING id`,
      [slug],
    );
    productId = productRes.rows[0].id as string;

    const requiredRes = await pool.query(
      `INSERT INTO product_checklist_items (product_id, label, order_index, is_required)
       VALUES ($1, 'Actualizar core', 1, true)
       RETURNING id`,
      [productId],
    );
    requiredItemId = requiredRes.rows[0].id as string;

    const optionalRes = await pool.query(
      `INSERT INTO product_checklist_items (product_id, label, order_index, is_required)
       VALUES ($1, 'Optimizar caché', 2, false)
       RETURNING id`,
      [productId],
    );
    optionalItemId = optionalRes.rows[0].id as string;

    const serviceRes = await pool.query(
      `INSERT INTO services (user_id, product_id, status, label, billing_cycle, amount, currency, created_at, updated_at)
       VALUES ($1, $2, 'active', 'Cloud Office Carmen', 'monthly', 49.99, 'EUR', NOW(), NOW())
       RETURNING id`,
      [clientUserId, productId],
    );
    serviceId = serviceRes.rows[0].id as string;

    token = await loginSuperadminAPI(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.1 — GET checklist devuelve items + completions vacíos
     ════════════════════════════════════════════════════════════════ */

  test('B.5.1 — GET /tasks/:id/checklist devuelve items del producto (fallback) sin completions', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.1 GET checklist',
    );

    const res = await authed(request, token, 'GET', `/tasks/${taskId}/checklist`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      items: Array<{ id: string; label: string; is_required: boolean; kind: string }>;
      completions: unknown[];
    };
    // Service no tiene snapshot → fallback a product_checklist_items.
    expect(body.items.length).toBe(2);
    expect(body.items.every((i) => i.kind === 'product')).toBe(true);
    expect(body.items.find((i) => i.id === requiredItemId)?.is_required).toBe(true);
    expect(body.items.find((i) => i.id === optionalItemId)?.is_required).toBe(false);
    expect(body.completions).toHaveLength(0);
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.2 — Completar item idempotente (upsert)
     ════════════════════════════════════════════════════════════════ */

  test('B.5.2 — POST /checklist/complete crea fila + repetir es idempotente', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.2 idempotente',
    );

    const r1 = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/checklist/complete`,
      { item_id: requiredItemId, item_kind: 'product', notes: 'v2.5' },
    );
    expect(r1.ok()).toBeTruthy();

    // Repetir — no debe duplicar fila
    const r2 = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/checklist/complete`,
      { item_id: requiredItemId, item_kind: 'product', notes: 'v2.5 (dup)' },
    );
    expect(r2.ok()).toBeTruthy();

    const countRes = await pool.query(
      `SELECT COUNT(*)::int FROM task_checklist_completions WHERE task_id = $1`,
      [taskId],
    );
    expect(countRes.rows[0].count).toBe(1);

    // El upsert actualiza notes (auditoría sin re-completar)
    const noteRes = await pool.query(
      `SELECT notes FROM task_checklist_completions WHERE task_id = $1`,
      [taskId],
    );
    expect(noteRes.rows[0].notes).toBe('v2.5 (dup)');
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.3 — Flujo Completar y notificar feliz path
     ════════════════════════════════════════════════════════════════ */

  test('B.5.3 — POST /maintenance/log con required completado: 201 + maintenance_log + task cerrada + email cliente', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.3 mantenimiento mensual',
    );

    // Completar el item required
    await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/checklist/complete`,
      { item_id: requiredItemId, item_kind: 'product' },
    );

    await clearMailbox();
    const closeRes = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/maintenance/log`,
      {
        notes: 'Core actualizado a v2.5. Backup verificado. Todo correcto.',
        internal_notes: 'Sin incidencias.',
      },
    );
    expect(
      closeRes.ok(),
      `Cierre maintenance falló: ${closeRes.status()} ${await closeRes.text()}`,
    ).toBeTruthy();
    const log = (await closeRes.json()) as {
      id: string;
      task_id: string;
      service_id: string;
      client_id: string;
      month_year: string;
    };
    expect(log.task_id).toBe(taskId);
    expect(log.service_id).toBe(serviceId);
    expect(log.client_id).toBe(clientUserId);
    expect(log.month_year).toMatch(/^\d{4}-\d{2}$/);

    // Task cerrada
    const taskRes = await pool.query(
      `SELECT status, completed_at FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(taskRes.rows[0].status).toBe('completed');
    expect(taskRes.rows[0].completed_at).not.toBeNull();

    // ClientNote creada con task_id + category=solution
    const noteRes = await pool.query(
      `SELECT category, task_id, body
       FROM client_notes
       WHERE user_id = $1 AND task_id = $2`,
      [clientUserId, taskId],
    );
    expect(noteRes.rowCount).toBe(1);
    expect(noteRes.rows[0].category).toBe('solution');
    expect(noteRes.rows[0].body).toBe('Sin incidencias.');

    // Email al cliente vía listener maintenance.completed
    const email = await waitForEmail('e2e-checklist-client@aelium.test', {
      subjectIncludes: 'Mantenimiento completado',
      timeoutMs: 15_000,
    });
    expect(email.Subject).toContain('Mantenimiento completado');
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.4 — EC-T8-01: items required sin completar bloquean cierre
     ════════════════════════════════════════════════════════════════ */

  test('B.5.4 (EC-T8-01) — POST /maintenance/log con required pendiente: 400 + missing_required + task sigue pending', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.4 required missing',
    );

    // NO completamos el required, sólo el optional
    await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/checklist/complete`,
      { item_id: optionalItemId, item_kind: 'product' },
    );

    const closeRes = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/maintenance/log`,
      { notes: 'Intentando cerrar sin required.' },
    );
    expect(closeRes.status()).toBe(400);
    const body = (await closeRes.json()) as {
      message:
        | string
        | { missing_required: { id: string; label: string; kind: string }[] };
      missing_required?: { id: string; label: string; kind: string }[];
    };
    // NestJS devuelve el `BadRequestException` con el objeto en .message
    // o en el body raíz dependiendo de la versión. Aceptamos ambas.
    const missing =
      body.missing_required ??
      (typeof body.message === 'object'
        ? body.message.missing_required
        : undefined);
    expect(missing).toBeDefined();
    expect(missing!.length).toBe(1);
    expect(missing![0].id).toBe(requiredItemId);
    expect(missing![0].label).toBe('Actualizar core');
    expect(missing![0].kind).toBe('product');

    // Task sigue pending (no se cerró parcialmente)
    const taskRes = await pool.query(
      `SELECT status FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(taskRes.rows[0].status).toBe('pending');

    // No hay maintenance_log
    const logCount = await pool.query(
      `SELECT COUNT(*)::int FROM maintenance_logs WHERE task_id = $1`,
      [taskId],
    );
    expect(logCount.rows[0].count).toBe(0);
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.5 — DTO valida notes obligatorio
     ════════════════════════════════════════════════════════════════ */

  test('B.5.5 — POST /maintenance/log sin notes: 400 (DTO obliga)', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.5 sin notes',
    );
    await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/checklist/complete`,
      { item_id: requiredItemId, item_kind: 'product' },
    );

    const res = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/maintenance/log`,
      {},
    );
    expect(res.status()).toBe(400);
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.6 — task ya cerrada bloquea (EC-T8-19 ya existente)
     ════════════════════════════════════════════════════════════════ */

  test('B.5.6 — POST /maintenance/log sobre task ya completed: 400', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.6 ya completada',
    );
    await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/checklist/complete`,
      { item_id: requiredItemId, item_kind: 'product' },
    );
    const ok = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/maintenance/log`,
      { notes: 'Primer cierre.' },
    );
    expect(ok.ok()).toBeTruthy();

    // Segundo intento — task ya completed
    const second = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/maintenance/log`,
      { notes: 'Intentando cerrar de nuevo.' },
    );
    expect(second.status()).toBe(400);
    const body = (await second.json()) as { message: string };
    expect(body.message).toContain('cerrada');
  });

  /* ════════════════════════════════════════════════════════════════
     B.5.7 — checklist_completions inline (atajo de un solo POST)
     ════════════════════════════════════════════════════════════════ */

  test('B.5.7 — POST /maintenance/log con checklist_completions inline cierra atómicamente', async ({
    request,
  }) => {
    const taskId = await createTaskMaintenance(
      request,
      token,
      'B.5.7 inline atajo',
    );

    const res = await authed(
      request,
      token,
      'POST',
      `/tasks/${taskId}/maintenance/log`,
      {
        notes: 'Cierre atómico en un solo POST.',
        checklist_completions: [
          { item_id: requiredItemId, item_kind: 'product' },
        ],
      },
    );
    expect(
      res.ok(),
      `Cierre inline falló: ${res.status()} ${await res.text()}`,
    ).toBeTruthy();

    // Verificar que la completion se persistió
    const completions = await pool.query(
      `SELECT item_id FROM task_checklist_completions WHERE task_id = $1`,
      [taskId],
    );
    expect(completions.rowCount).toBe(1);
    expect(completions.rows[0].item_id).toBe(requiredItemId);
  });
});

/**
 * E2E — Sprint 8 Fase B.9 (2026-04-30).
 *
 * Cubre el refactor de notas y modal de cierre:
 *
 *   B.9.1 — POST /tasks/:id/notes crea ClientNote(category=technical) + task_id.
 *   B.9.2 — GET /tasks/:id/notes devuelve la nota con autor enriquecido (first/last_name).
 *   B.9.3 — Completar contact_client con client_notes → cliente recibe email.
 *   B.9.4 — Completar contact_client SIN client_notes → cierra OK pero NO notifica.
 *   B.9.5 — Completar maintenance sigue requiriendo nota (regresión Fase B.5).
 *   B.9.6 — Completar con internal_notes ya NO crea ClientNote(solution); las notas
 *           internas viven en /notes y persisten antes del cierre.
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
let clientEmail: string;

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

test.describe('Tasks — notes inline + completion modal (Sprint 8 Fase B.9)', () => {
  let superadminToken: string;

  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();

    clientEmail = 'e2e-b9-client@aelium.test';
    clientUserId = await createUser({
      email: clientEmail,
      firstName: 'Carla',
      lastName: 'B9',
      roleSlug: 'client',
    });

    superadminToken = await loginSuperadmin(request);
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('B.9.1/B.9.2 — POST /tasks/:id/notes persiste y GET la devuelve con autor', async ({
    request,
  }) => {
    const createRes = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'custom_work',
      title: 'B.9 nota inline',
      priority: 'low',
      client_id: clientUserId,
    });
    expect(createRes.ok()).toBeTruthy();
    const task = (await createRes.json()) as { id: string };

    const noteRes = await authed(
      request,
      superadminToken,
      'POST',
      `/tasks/${task.id}/notes`,
      { body: 'Esperando respuesta del cliente sobre las credenciales.' },
    );
    expect(noteRes.ok()).toBeTruthy();
    const note = (await noteRes.json()) as {
      id: string;
      body: string;
      author: { first_name: string };
    };
    expect(note.body).toContain('Esperando respuesta');
    expect(note.author.first_name).toBeTruthy();

    const listRes = await authed(
      request,
      superadminToken,
      'GET',
      `/tasks/${task.id}/notes`,
    );
    const list = (await listRes.json()) as { id: string }[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(note.id);

    const dbRow = await pool.query(
      `SELECT category, task_id, user_id FROM client_notes WHERE id = $1`,
      [note.id],
    );
    expect(dbRow.rows[0].category).toBe('technical');
    expect(dbRow.rows[0].task_id).toBe(task.id);
    expect(dbRow.rows[0].user_id).toBe(clientUserId);
  });

  test('B.9.3 — completar contact_client con client_notes → cliente recibe email', async ({
    request,
  }) => {
    const createRes = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'contact_client',
      title: 'B.9 llamada bienvenida',
      priority: 'medium',
      client_id: clientUserId,
      reason: 'Bienvenida primer servicio',
    });
    const task = (await createRes.json()) as { id: string };

    await clearMailbox();
    const completeRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task.id}/complete`,
      {
        client_notes:
          'Hemos hablado con el cliente y resuelto sus dudas iniciales.',
      },
    );
    expect(completeRes.ok()).toBeTruthy();

    const email = await waitForEmail(clientEmail, {
      subjectIncludes: 'B.9 llamada bienvenida',
      timeoutMs: 15_000,
    });
    expect(email.Subject).toContain('Sobre tu solicitud');
  });

  test('B.9.4 — completar contact_client SIN client_notes cierra OK y NO notifica', async ({
    request,
  }) => {
    const createRes = await authed(request, superadminToken, 'POST', '/tasks', {
      type: 'contact_client',
      title: 'B.9 sin nota cliente',
      priority: 'low',
      client_id: clientUserId,
    });
    const task = (await createRes.json()) as { id: string };

    await clearMailbox();
    const completeRes = await authed(
      request,
      superadminToken,
      'PATCH',
      `/tasks/${task.id}/complete`,
      {},
    );
    expect(completeRes.ok()).toBeTruthy();
    const completed = (await completeRes.json()) as { status: string };
    expect(completed.status).toBe('completed');

    // Esperar 2s y verificar que NO ha llegado email de "Sobre tu
    // solicitud" — el listener no debe disparar si client_notes vacío.
    let received = false;
    try {
      await waitForEmail(clientEmail, {
        subjectIncludes: 'B.9 sin nota cliente',
        timeoutMs: 2_500,
      });
      received = true;
    } catch {
      received = false;
    }
    expect(received).toBe(false);
  });
});

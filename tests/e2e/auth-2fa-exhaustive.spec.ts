/**
 * E2E — Casos límite del flujo 2FA + lockout (P0.4).
 *
 * Complementa `auth.spec.ts` (happy path register → verify → login) con:
 *   1. **2FA con código incorrecto** → 401 + mensaje de error legible.
 *   2. **2FA con código correcto tras error previo** → recupera y entra.
 *   3. **Lockout tras N fallos de password** → status del usuario pasa a
 *      `blocked` y los siguientes intentos (incluso con password correcta)
 *      son rechazados.
 *
 * 2FA expirado (>5min) NO se cubre aquí — esperar 5 min real es inviable
 * en CI y firmar un JWT con `exp` pasado introduce acoplamiento al secret.
 * El timing del expiry está cubierto en el unit test de `verify2fa`.
 *
 * Estrategia API-driven (no UI): más rápido, menos flaky, y prueba la
 * misma capa de seguridad que la UI consume.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';

let pool: Pool;

async function getRoleId(slug: string): Promise<string> {
  const res = await pool.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (!res.rows[0]) throw new Error(`Role ${slug} not found`);
  return res.rows[0].id;
}

async function createVerifiedUser(opts: {
  email: string;
  password: string;
  roleSlug: string;
}): Promise<string> {
  const roleId = await getRoleId(opts.roleSlug);
  const passwordHash = await bcrypt.hash(opts.password, 4);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified_at, role_id, login_attempts)
     VALUES ($1, $2, 'Test', 'User', 'active', NOW(), $3, 0)
     RETURNING id`,
    [opts.email, passwordHash, roleId],
  );
  return res.rows[0].id;
}

async function getUserStatus(
  email: string,
): Promise<{ status: string; login_attempts: number; blocked_until: Date | null }> {
  const r = await pool.query<{
    status: string;
    login_attempts: number;
    blocked_until: Date | null;
  }>(
    `SELECT status, login_attempts, blocked_until FROM users WHERE email = $1`,
    [email],
  );
  if (!r.rows[0]) throw new Error(`User ${email} not found`);
  return r.rows[0];
}

async function postLogin(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  return request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
    failOnStatusCode: false,
  });
}

async function postVerify2fa(
  request: APIRequestContext,
  temp_token: string,
  code: string,
) {
  return request.post(`${TEST_CONFIG.apiUrl}/auth/verify-2fa`, {
    data: { temp_token, code },
    failOnStatusCode: false,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Auth — 2FA edge cases + lockout (P0.4)', () => {
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await resetTestData();
    // Limpia cualquier lockout residual del superadmin (otros tests pueden
    // haberle dejado intentos fallidos).
    await pool.query(
      `UPDATE users SET login_attempts = 0, blocked_until = NULL WHERE email = $1`,
      [TEST_CONFIG.superadmin.email],
    );
  });

  test.afterAll(async () => {
    await pool?.end();
    await disconnectDb();
  });

  test('2FA con código incorrecto → 401; con código correcto a continuación → access_token', async ({
    request,
  }) => {
    await clearMailbox();

    // Step 1: login del superadmin (rol con 2FA). Endpoint usa @HttpCode(OK) → 200.
    const loginRes = await postLogin(
      request,
      TEST_CONFIG.superadmin.email,
      SUPERADMIN_PASSWORD,
    );
    expect(loginRes.status()).toBe(200);
    const { temp_token, requires_2fa } = (await loginRes.json()) as {
      temp_token?: string;
      requires_2fa?: boolean;
    };
    expect(requires_2fa).toBe(true);
    expect(temp_token).toBeTruthy();

    // Step 2: el email con el código real ya está en MailPit.
    const codeMail = await waitForEmail(TEST_CONFIG.superadmin.email, {
      subjectIncludes: 'código',
      timeoutMs: 15_000,
    });
    const realCode = extract2FACode(codeMail);

    // Step 3: enviar un código incorrecto debe ser rechazado.
    const wrongCode = realCode === '000000' ? '111111' : '000000';
    const verifyWrong = await postVerify2fa(request, temp_token!, wrongCode);
    expect(verifyWrong.status()).toBe(401);
    const wrongBody = (await verifyWrong.json()) as { message?: string };
    expect(wrongBody.message?.toLowerCase()).toMatch(/incorrecto|inválido/);

    // Step 4: ahora el código correcto debe funcionar (el endpoint NO bloquea
    // tras un intento fallido — eso lo gestiona handleFailedLogin de password,
    // no de 2FA).
    const verifyOk = await postVerify2fa(request, temp_token!, realCode);
    expect(
      verifyOk.ok(),
      `verify-2fa correcto falló: ${verifyOk.status()} ${await verifyOk.text()}`,
    ).toBeTruthy();
    const okBody = (await verifyOk.json()) as { access_token?: string };
    expect(okBody.access_token).toBeTruthy();
  });

  test('lockout tras 5 fallos de password — usuario queda blocked y rechaza incluso credenciales correctas', async ({
    request,
  }) => {
    const email = 'e2e-lockout@aelium.test';
    const goodPassword = 'CorrectPassword123!';
    const badPassword = 'WrongPassword999!';

    // Reuse client role (no 2FA → sólo prueba el flujo de password).
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    await createVerifiedUser({ email, password: goodPassword, roleSlug: 'client' });

    // 5 intentos con password incorrecta.
    for (let i = 1; i <= 5; i++) {
      const res = await postLogin(request, email, badPassword);
      expect(
        res.status(),
        `intento ${i} con password incorrecta debería ser 401`,
      ).toBe(401);
    }

    // Tras 5 intentos: login_attempts >= 5, blocked_until set (handleFailedLogin
    // sólo modifica blocked_until — el status permanece 'active' hasta que
    // intervención manual lo cambie).
    const after5 = await getUserStatus(email);
    expect(after5.login_attempts).toBeGreaterThanOrEqual(5);
    expect(after5.blocked_until).not.toBeNull();
    expect(after5.blocked_until!.getTime()).toBeGreaterThan(Date.now());

    // 6º intento, esta vez con password CORRECTA: debe seguir fallando porque
    // la guardia de blocked_until (auth-login.service.ts:61) corre antes que
    // la verificación de password. Devuelve 403 Forbidden.
    const blockedRes = await postLogin(request, email, goodPassword);
    expect(blockedRes.status()).toBe(403);
    const blockedBody = (await blockedRes.json()) as { message?: string };
    expect(blockedBody.message?.toLowerCase()).toMatch(/bloque/);

    // Cleanup
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
  });
});

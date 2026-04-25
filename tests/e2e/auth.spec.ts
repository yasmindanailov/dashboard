/**
 * E2E — Flujo de autenticación completo.
 *
 * Cubre:
 *   1. Registro de un usuario nuevo
 *   2. Recepción del email de verificación (vía MailPit)
 *   3. Click en el link de verificación
 *   4. Login del usuario verificado
 *   5. Llegada al dashboard
 *
 * Es el flujo más crítico: si esto se rompe, ningún cliente puede acceder.
 */

import { test, expect } from '@playwright/test';
import { clearMailbox, waitForEmail, extractVerifyEmailLink } from './fixtures/mailpit';
import { resetTestData, deleteUserByEmail, disconnectDb } from './fixtures/db';

// Datos del usuario de prueba (regenerados por test para evitar colisiones)
// Usamos .test como TLD (RFC 2606, reservado para tests). `.local` sería
// válido pero algunos navegadores lo rechazan en validación HTML5 type=email.
function makeTestUser() {
  const stamp = Date.now();
  return {
    firstName: 'Test',
    lastName: 'User',
    email: `e2e-user-${stamp}@aelium.test`,
    password: 'TestPassword123!',
  };
}

test.describe('Auth flow', () => {
  test.beforeAll(async () => {
    // Limpia datos de tests previos del mismo proyecto.
    await resetTestData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test.beforeEach(async () => {
    // Cada test arranca con buzón vacío para que waitForEmail no encuentre
    // emails de tests anteriores.
    await clearMailbox();
  });

  test('registro → verificación email → login completos', async ({ page }) => {
    const user = makeTestUser();

    // ── 1. Registro ──
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /crear cuenta/i })).toBeVisible();

    await page.locator('#reg-first').fill(user.firstName);
    await page.locator('#reg-last').fill(user.lastName);
    await page.locator('#reg-email').fill(user.email);
    await page.locator('#reg-password').fill(user.password);
    await page.locator('#reg-confirm').fill(user.password);

    await page.getByRole('button', { name: /crear cuenta/i }).click();

    // Pantalla de éxito post-registro: "Verifica tu email"
    await expect(page.getByRole('heading', { name: /verifica tu email/i })).toBeVisible({
      timeout: 10_000,
    });

    // ── 2. Email de verificación ──
    const message = await waitForEmail(user.email, {
      timeoutMs: 15_000,
      subjectIncludes: 'verifica',
    });
    const verifyLink = extractVerifyEmailLink(message);
    expect(verifyLink).toContain('/verify-email?token=');

    // ── 3. Click en link de verificación ──
    // El link en el email apunta al frontend. Lo seguimos.
    await page.goto(verifyLink);

    // La página /verify-email muestra estado de éxito o error.
    // Esperamos texto positivo (varía según copy).
    await expect(page.getByText(/verificado|cuenta activada|ya puedes/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 4. Login con el usuario recién verificado ──
    await page.goto('/');
    // En la página de login los inputs son por id `email` y `password`.
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole('button', { name: /iniciar|entrar/i }).click();

    // ── 5. Llegada al dashboard ──
    // Usuarios con rol "client" no requieren 2FA por defecto (solo superadmin/agentes).
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('login con email no verificado muestra opción de reenvío', async ({ page }) => {
    const user = makeTestUser();

    // Registro pero sin verificar
    await page.goto('/register');
    await page.locator('#reg-first').fill(user.firstName);
    await page.locator('#reg-last').fill(user.lastName);
    await page.locator('#reg-email').fill(user.email);
    await page.locator('#reg-password').fill(user.password);
    await page.locator('#reg-confirm').fill(user.password);
    await page.getByRole('button', { name: /crear cuenta/i }).click();
    await expect(page.getByRole('heading', { name: /verifica tu email/i })).toBeVisible();

    // Cleanup: borramos el usuario al final del test (próximo test puede reutilizar email base si no)
    // No lo borramos aquí porque el email es único por timestamp.

    // Intento de login sin verificar
    await page.goto('/');
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole('button', { name: /iniciar|entrar/i }).click();

    // Frontend muestra UI específica para "pending_verification" con botón
    // de reenvío de email (Sprint 3.5.8). Aceptamos cualquier alusión a verificación.
    await expect(page.getByText(/verificar|verificación|reenviar/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Cleanup explícito
    await deleteUserByEmail(user.email);
  });
});

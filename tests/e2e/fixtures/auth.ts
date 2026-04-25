/**
 * Helpers de autenticación para tests E2E.
 *
 * Login a través de la UI (más realista) y a través de API (más rápido).
 */

import { Page, APIRequestContext, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config';
import { clearMailbox, waitForEmail, extract2FACode } from './mailpit';

/**
 * Login del superadmin a través de la UI, gestionando el step de 2FA.
 *
 * Backend: ROLES_REQUIRING_2FA incluye superadmin + agentes (auth-login.service).
 * Por tanto este flujo SIEMPRE pasa por el step 2FA. El código se envía por
 * email (MailPit) y lo leemos para introducirlo.
 *
 * Limpia el buzón ANTES del submit de credentials para evitar matches con
 * códigos 2FA de runs/tests previos.
 *
 * Selectores por id (no getByLabel) porque el botón "Mostrar contraseña"
 * tiene aria-label que matchea con regex abiertas y strict mode lo rechaza.
 */
export async function loginSuperadminUI(page: Page): Promise<void> {
  // Limpia mailbox para que el waitForEmail solo vea el código 2FA nuevo.
  await clearMailbox();

  await page.goto('/');
  await page.locator('#login-email').fill(TEST_CONFIG.superadmin.email);
  await page.locator('#login-password').fill(TEST_CONFIG.superadmin.password);
  await page.getByRole('button', { name: /^(iniciar|entrar|login)/i }).click();

  // Tras submit: o bien aparece input #login-2fa (rol con 2FA), o redirige
  // directo al dashboard (rol sin 2FA, ej: client). Esperamos el primero
  // que ocurra y actuamos en consecuencia.
  const code2faInput = page.locator('#login-2fa');
  await Promise.race([
    code2faInput.waitFor({ state: 'visible', timeout: 15_000 }),
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
  ]);

  if (await code2faInput.isVisible().catch(() => false)) {
    // Step 2FA: leer el código del email y enviarlo.
    const message = await waitForEmail(TEST_CONFIG.superadmin.email, {
      timeoutMs: 15_000,
      subjectIncludes: 'código',
    });
    const code = extract2FACode(message);
    await code2faInput.fill(code);
    // El form de 2FA tiene su propio submit ("Verificar" o similar).
    await page.getByRole('button', { name: /^(verificar|confirmar|continuar)/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }
  // Si no había 2FA, el waitForURL ya nos dejó en /dashboard.
}

/**
 * Login vía API. Devuelve el access_token.
 * Más rápido que UI y útil cuando el test no necesita probar el flujo de login.
 */
export async function loginAPI(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });

  expect(res.ok(), `Login falló: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { access_token: string; refresh_token: string };
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/**
 * Inyecta access_token en localStorage del navegador para saltarse el login UI.
 * El frontend lo lee desde 'access_token' (ver lib/api.ts).
 */
export async function injectAuthToken(page: Page, accessToken: string): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('access_token', token);
  }, accessToken);
}

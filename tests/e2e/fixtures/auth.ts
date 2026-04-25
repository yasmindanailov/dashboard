/**
 * Helpers de autenticación para tests E2E.
 *
 * Login a través de la UI (más realista) y a través de API (más rápido).
 */

import { Page, APIRequestContext, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config';

/**
 * Login del superadmin a través de la UI.
 * Si la cuenta tiene 2FA activo, este helper NO lo maneja (usar loginWith2FA).
 */
export async function loginSuperadminUI(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(TEST_CONFIG.superadmin.email);
  await page.getByLabel(/contraseña|password/i).fill(TEST_CONFIG.superadmin.password);
  await page.getByRole('button', { name: /iniciar|entrar|login/i }).click();
  // Esperar redirección al dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
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

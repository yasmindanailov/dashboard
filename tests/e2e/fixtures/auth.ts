/**
 * Helpers de autenticación para tests E2E.
 *
 * Login a través de la UI (más realista) y a través de API (más rápido).
 *
 * Doctrina canónica (ADR-078 Amendment A1, Sprint 13 §13.AUTH Fase F):
 *   - El JWT vive en cookies httpOnly del dominio Next.js — NUNCA en
 *     localStorage. El frontend ya no lee `localStorage.getItem('access_token')`.
 *   - Para acelerar tests que no prueban el flow de login, `injectAuthSession`
 *     setea las cookies `aelium_access_token` + `aelium_refresh_token`
 *     directamente en el contexto Playwright (httpOnly visible al servidor
 *     Next.js, no al JS del cliente — equivalente al flow real).
 */
import { Page, APIRequestContext, BrowserContext, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config';
import { clearMailbox, waitForEmail, extract2FACode } from './mailpit';

/** Nombres canónicos de cookie — alineados con `frontend/app/lib/server-auth.ts`. */
const COOKIE_ACCESS = 'aelium_access_token';
const COOKIE_REFRESH = 'aelium_refresh_token';

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
  // directo al landing del rol (rol sin 2FA, ej: client → /dashboard;
  // staff → /admin tras Sprint 9 Fase F + DC.7). Esperamos el primero que
  // ocurra y actuamos en consecuencia.
  const code2faInput = page.locator('#login-2fa');
  await Promise.race([
    code2faInput.waitFor({ state: 'visible', timeout: 15_000 }),
    page.waitForURL(/\/(dashboard|admin)/, { timeout: 15_000 }),
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
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15_000 });
  }
  // Si no había 2FA, el waitForURL ya nos dejó en el landing del rol.
}

/**
 * Login vía API. Devuelve el par de tokens (access + refresh).
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
 * Inyecta el par de tokens como cookies httpOnly del dominio Next.js para
 * saltarse el login UI (ADR-078 Amendment A1 — Modelo A).
 *
 * Cookies seteadas: `aelium_access_token` + `aelium_refresh_token` con
 * `httpOnly=true`, `sameSite=Lax`. Estas son las mismas que setea
 * `loginAction` server-side; el Server Component las lee con `cookies()` de
 * `next/headers` y reenvía al backend NestJS como `Authorization: Bearer`.
 *
 * Pasar `accessToken` solo (sin refresh) es válido para tests cortos que no
 * dependen de rotación; pero el patrón canónico es pasar ambos (la cookie
 * de refresh permite que `serverFetch` invoque `refreshAction` si recibe 401).
 *
 * Nota: Playwright (`network.js#rewriteCookies`) rechaza la combinación
 * `url + path` con el error "Cookie should have either url or path". Pasamos
 * solo `url` y Playwright deriva `domain` + `path` (`/`) automáticamente.
 */
export async function injectAuthSession(
  context: BrowserContext,
  tokens: { accessToken: string; refreshToken?: string },
): Promise<void> {
  const cookieEntries = [
    {
      name: COOKIE_ACCESS,
      value: tokens.accessToken,
      url: TEST_CONFIG.frontendUrl,
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
  ];
  if (tokens.refreshToken) {
    cookieEntries.push({
      name: COOKIE_REFRESH,
      value: tokens.refreshToken,
      url: TEST_CONFIG.frontendUrl,
      httpOnly: true,
      sameSite: 'Lax' as const,
    });
  }
  await context.addCookies(cookieEntries);
}

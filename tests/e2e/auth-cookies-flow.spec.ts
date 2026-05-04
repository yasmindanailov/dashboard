/**
 * E2E — Sprint 13 §13.AUTH Fase F (DoD §4.3 / §7.1).
 *
 * Verifica el flow canónico de cookies httpOnly del Modelo A
 * (ADR-078 Amendment A1):
 *
 *   1. Login UI completa (incluye 2FA superadmin).
 *   2. Las cookies `aelium_access_token` + `aelium_refresh_token` quedan
 *      seteadas en el contexto del navegador con `httpOnly=true` y
 *      `sameSite=Lax`.
 *   3. Logout vía Topbar dropdown limpia ambas cookies.
 *   4. Tras logout, navegar a `/admin` redirige a `/` (sesión revocada).
 *
 * Cubre el invariante AUTH-INV-8 (cookies httpOnly únicas portadoras del JWT
 * en el dominio Next.js) y la regla R17 (`docs/00-foundations/rules.md`).
 */

import { test, expect } from '@playwright/test';
import { loginSuperadminUI } from './fixtures/auth';

const COOKIE_ACCESS = 'aelium_access_token';
const COOKIE_REFRESH = 'aelium_refresh_token';

test.describe('Auth cookies flow — Sprint 13 §13.AUTH (ADR-078 A1)', () => {
  test('login UI crea cookies httpOnly Next.js + logout las limpia', async ({
    page,
    context,
  }) => {
    /* ── 1. Login completo (superadmin con 2FA) ────────────────────── */
    await loginSuperadminUI(page);
    await expect(page).toHaveURL(/\/admin/);

    /* ── 2. Cookies httpOnly seteadas en el dominio Next.js ────────── */
    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === COOKIE_ACCESS);
    const refresh = cookies.find((c) => c.name === COOKIE_REFRESH);

    expect(access, 'aelium_access_token debe existir tras login').toBeDefined();
    expect(access!.httpOnly).toBe(true);
    expect(access!.sameSite).toBe('Lax');
    expect(access!.path).toBe('/');
    expect(access!.value.length).toBeGreaterThan(20); // JWT no vacío

    expect(refresh, 'aelium_refresh_token debe existir tras login').toBeDefined();
    expect(refresh!.httpOnly).toBe(true);
    expect(refresh!.sameSite).toBe('Lax');
    expect(refresh!.path).toBe('/');

    /* ── 3. Logout vía Topbar dropdown ─────────────────────────────── */
    // El profile dropdown trigger es el único button con aria-haspopup="true"
    // del header SIN aria-label (NotificationBell tiene aria-label="Notificaciones").
    const profileTrigger = page.locator(
      'header button[aria-haspopup="true"]:not([aria-label])',
    );
    await profileTrigger.click();
    await page.getByRole('button', { name: /cerrar sesión/i }).click();

    // logoutAction redirige a `/` (Server Action — limpia cookies + redirect).
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });

    /* ── 4. Cookies eliminadas ─────────────────────────────────────── */
    const cookiesAfter = await context.cookies();
    expect(
      cookiesAfter.find((c) => c.name === COOKIE_ACCESS),
      'access cookie debe desaparecer tras logout',
    ).toBeUndefined();
    expect(
      cookiesAfter.find((c) => c.name === COOKIE_REFRESH),
      'refresh cookie debe desaparecer tras logout',
    ).toBeUndefined();

    /* ── 5. Forzar /admin sin sesión → redirige a `/` ──────────────── */
    await page.goto('/admin');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  });
});

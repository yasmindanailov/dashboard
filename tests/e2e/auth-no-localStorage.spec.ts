/**
 * E2E — Sprint 13 §13.AUTH Fase F (DoD §4.3 / §7.3).
 *
 * Regresión canónica de la doctrina Modelo A (ADR-078 Amendment A1):
 * tras un login completo en navegador, `localStorage` NO contiene ningún
 * token de auth. El JWT vive solo en cookies httpOnly del dominio Next.js.
 *
 * Cubre la regla R17 (`docs/00-foundations/rules.md`) y el cierre de DC.28.
 * Es el guard automatizado contra la regresión histórica del proyecto:
 * cualquier reintroducción de `localStorage.setItem('access_token', …)` en
 * el frontend hace fallar este spec.
 */

import { test, expect } from '@playwright/test';
import { loginSuperadminUI } from './fixtures/auth';

test.describe('Auth no-localStorage regression — Sprint 13 §13.AUTH', () => {
  test('post-login: localStorage NO contiene tokens (R17)', async ({ page }) => {
    await loginSuperadminUI(page);
    await expect(page).toHaveURL(/\/admin/);

    // Lectura completa del Storage del navegador post-login.
    const storage = await page.evaluate(() => ({
      access: window.localStorage.getItem('access_token'),
      refresh: window.localStorage.getItem('refresh_token'),
      // Listamos TODAS las claves para auditar futuros desvíos.
      keys: Object.keys(window.localStorage),
    }));

    expect(
      storage.access,
      'localStorage NO debe contener access_token (R17 + ADR-078 A1)',
    ).toBeNull();
    expect(
      storage.refresh,
      'localStorage NO debe contener refresh_token (R17 + ADR-078 A1)',
    ).toBeNull();

    // Defense in depth: ninguna clave existente debe insinuar token/jwt/auth.
    // Las claves UI legítimas (admin.sidebar.collapsed, theme, locale, etc.)
    // están permitidas — solo bloqueamos las que huelan a credenciales.
    for (const key of storage.keys) {
      expect(
        key,
        `localStorage key "${key}" parece relacionada con auth — viola R17`,
      ).not.toMatch(/token|jwt|secret|credential/i);
    }
  });
});

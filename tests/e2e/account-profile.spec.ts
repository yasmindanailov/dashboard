/**
 * E2E — Sprint Cuenta (página de usuario self-service · ADR-085).
 *
 * Cierra parte del hueco GL-26 (audit 2026-06-25 §6 TIER 4): "Sprint Cuenta sin
 * E2E". Verifica el flujo end-to-end de `/dashboard/profile` (cliente) y
 * `/admin/profile` (staff) a través del stack real (Next.js + NestJS):
 *
 *   1. Cliente en /dashboard/profile: ve las secciones Cuenta + Seguridad +
 *      Facturación, con sus datos **self-scoped por el JWT** (sin IDOR — el
 *      backend deriva el userId de la sesión, nunca de la URL). Tras
 *      `resetTestData()` no hay titular WHOIS → la pestaña Dominios no aparece.
 *   2. Staff en /admin/profile: ve **solo** Cuenta + Seguridad (sin Facturación
 *      ni Dominios) — regresión del fix C·2 (ADR-066: el portal de cliente no es
 *      del staff; su cuenta vive en /admin reutilizando `_shared/account/`).
 *
 * Patrón de login: cliente vía API + cookies httpOnly inyectadas (Modelo A,
 * ADR-078 A1); staff vía UI completa (incluye 2FA por email del rol superadmin).
 */
import { test, expect } from '@playwright/test';
import { loginAPI, injectAuthSession, loginSuperadminUI } from './fixtures/auth';
import { resetTestData, disconnectDb } from './fixtures/db';
import { TEST_CONFIG } from './fixtures/test-config';

test.describe('Cuenta self-service (Sprint Cuenta — ADR-085)', () => {
  test.beforeAll(async () => {
    // Estado conocido: preserva las cuentas seed (cliente + superadmin) y
    // limpia billing_profiles / client_profiles / sessions de runs previos.
    await resetTestData();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test('cliente: /dashboard/profile self-scoped (Cuenta/Seguridad/Facturación, sin Dominios)', async ({
    page,
    context,
    request,
  }) => {
    // Login del cliente vía API → cookies httpOnly en el dominio Next.js.
    const tokens = await loginAPI(
      request,
      TEST_CONFIG.client.email,
      TEST_CONFIG.client.password,
    );
    await injectAuthSession(context, tokens);

    await page.goto('/dashboard/profile');

    await expect(
      page.getByRole('heading', { name: 'Mi cuenta', level: 1 }),
    ).toBeVisible();

    // Secciones que ve un cliente.
    await expect(page.getByRole('tab', { name: 'Cuenta' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Seguridad' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Facturación/ })).toBeVisible();
    // Tras resetTestData() no hay titular WHOIS → sin pestaña Dominios.
    await expect(page.getByRole('tab', { name: 'Dominios' })).toHaveCount(0);

    // Self-scoped (sin IDOR): la sección Cuenta (activa por defecto) muestra el
    // email del JWT en un campo de solo lectura.
    await expect(page.getByText('Datos de la cuenta')).toBeVisible();
    await expect(page.getByDisplayValue(TEST_CONFIG.client.email)).toBeVisible();

    // Cambio de pestaña a Seguridad (aserción robusta vía aria-selected del DS Tabs).
    const securityTab = page.getByRole('tab', { name: 'Seguridad' });
    await securityTab.click();
    await expect(securityTab).toHaveAttribute('aria-selected', 'true');
  });

  test('staff: /admin/profile muestra SOLO Cuenta + Seguridad (fix C·2, ADR-066)', async ({
    page,
  }) => {
    // Login UI del superadmin (incluye paso 2FA por email — MailPit).
    await loginSuperadminUI(page);
    await expect(page).toHaveURL(/\/admin/);

    await page.goto('/admin/profile');

    await expect(
      page.getByRole('heading', { name: 'Mi cuenta', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cuenta' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Seguridad' })).toBeVisible();
    // El staff NO gestiona facturación ni titular de dominios desde su cuenta.
    await expect(page.getByRole('tab', { name: /Facturación/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Dominios' })).toHaveCount(0);
  });
});

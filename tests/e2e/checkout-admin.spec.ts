/**
 * E2E — Smoke test del flujo de checkout admin.
 *
 * Versión inicial: verifica que el admin puede acceder al dashboard de
 * billing y que la lista de facturas carga sin errores.
 *
 * El flujo completo (crear factura desde checkout, marcar como pagada,
 * descargar PDF) se cubrirá iterativamente en tests adicionales según
 * se estabilicen los selectores.
 *
 * Crítico porque el flujo de billing es uno de los 3 que NO puede romperse
 * silenciosamente — afecta directamente al ingreso del negocio.
 */

import { test, expect } from '@playwright/test';
import { loginSuperadminUI } from './fixtures/auth';

test.describe('Checkout / Billing admin', () => {
  test('admin accede al listado de facturas sin errores', async ({ page }) => {
    // Capturar errores de consola para detectar fallos silenciosos.
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
    });

    // Login admin
    await loginSuperadminUI(page);

    // Navegar a billing
    await page.goto('/dashboard/billing');
    await page.waitForLoadState('networkidle');

    // La página debe cargar el ListPage de billing.
    // Comprueba el heading o un elemento característico.
    await expect(page.locator('h1, h2').filter({ hasText: /factura/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    // No debe haber errores de consola serios.
    // Filtramos warnings conocidos de Next.js dev mode.
    const seriousErrors = consoleErrors.filter(
      (e) => !/devtools|hydration|hot.?reload/i.test(e),
    );
    expect(seriousErrors, `Errores de consola: ${seriousErrors.join('\n')}`).toHaveLength(0);
  });

  test('admin puede acceder al checkout para crear servicio', async ({ page }) => {
    await loginSuperadminUI(page);
    await page.goto('/dashboard/billing/checkout');
    await page.waitForLoadState('networkidle');

    // El checkout admin pide seleccionar un cliente target primero (EC-BILL-02).
    // Verificamos al menos que la página renderiza sin crash.
    await expect(page.locator('main, [role="main"], body')).toBeVisible();

    // El título o algún elemento de Step 1 (cliente) debe estar visible.
    // Aceptamos varios textos posibles según el copy actual.
    await expect(
      page.getByText(/cliente|seleccion|contratar|crear servicio/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

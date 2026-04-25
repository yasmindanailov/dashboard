/**
 * E2E — Smoke test del flujo de soporte (chat / tickets).
 *
 * Versión inicial: verifica que el admin puede acceder a las páginas de
 * soporte y que las listas (chats agente y tickets) cargan sin errores.
 *
 * El flujo completo de escalación chat→ticket requiere fixtures más
 * complejos (chat existente con mensajes, WS connection) que se añadirán
 * iterativamente.
 *
 * Crítico porque soporte es el principal canal de comunicación con
 * clientes activos: si se cae, el negocio pierde visibilidad inmediata.
 */

import { test, expect } from '@playwright/test';
import { loginSuperadminUI } from './fixtures/auth';

test.describe('Soporte', () => {
  test('admin accede a la bandeja de tickets', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
    });

    await loginSuperadminUI(page);
    await page.goto('/dashboard/support');
    await page.waitForLoadState('networkidle');

    // Verifica heading de la página
    await expect(
      page.locator('h1, h2').filter({ hasText: /soporte|ticket/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const seriousErrors = consoleErrors.filter(
      (e) => !/devtools|hydration|hot.?reload|websocket/i.test(e),
    );
    expect(seriousErrors, `Errores de consola: ${seriousErrors.join('\n')}`).toHaveLength(0);
  });

  test('admin accede al panel de chats en tiempo real', async ({ page }) => {
    await loginSuperadminUI(page);
    await page.goto('/dashboard/support/chats');
    await page.waitForLoadState('networkidle');

    // El panel de chats tiene 3 columnas (lista chats / conversación / contexto).
    // Verifica al menos que la página renderiza algún contenedor del panel.
    await expect(page.locator('main, [role="main"], body')).toBeVisible();
    await expect(
      page.getByText(/chat|conversación|sin chat|sin conversación/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('admin puede crear un nuevo ticket desde el modal', async ({ page }) => {
    await loginSuperadminUI(page);
    await page.goto('/dashboard/support');
    await page.waitForLoadState('networkidle');

    // Botón "Nuevo ticket" debe estar visible para admin.
    const newTicketButton = page.getByRole('button', { name: /nuevo ticket|crear ticket/i });
    await expect(newTicketButton).toBeVisible({ timeout: 10_000 });

    // Click abre modal.
    await newTicketButton.click();

    // El modal de NewTicket aparece.
    await expect(
      page.getByRole('heading', { name: /nuevo ticket|crear ticket/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Cerrar modal sin enviar (no creamos ticket real para no contaminar DB).
    await page.keyboard.press('Escape');
  });
});

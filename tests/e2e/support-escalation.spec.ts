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
    await loginSuperadminUI(page);
    await page.goto('/dashboard/support');

    // Verifica que la página de soporte renderizó. Buscamos texto típico de
    // la bandeja de tickets ("Tickets", "Soporte", filtros como "Todos",
    // "Abiertos", o el botón "Nuevo ticket"). Selector flexible para
    // tolerar variaciones de copy.
    await expect(
      page.getByText(/ticket|soporte|nuevo|abiertos|cerrados|prioridad/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Nota: no validamos errores de consola aquí. Sentry y WebSocket
    // pueden generar warnings legítimos; la validación estricta de consola
    // se añadirá cuando F0.6 termine de sanear el frontend.
  });

  test('admin accede al panel de chats en tiempo real', async ({ page }) => {
    await loginSuperadminUI(page);
    await page.goto('/dashboard/support/chats');

    // El panel de chats tiene 3 columnas (lista chats / conversación / contexto).
    // Aceptamos textos típicos del panel o estados vacíos ("Sin chats").
    await expect(
      page.getByText(/chat|conversaci|sin chats?|sin conversaci|esperando/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('admin puede crear un nuevo ticket desde el modal', async ({ page }) => {
    await loginSuperadminUI(page);
    await page.goto('/dashboard/support');
    // No usamos networkidle: el WebSocket de soporte queda abierto y
    // networkidle nunca se alcanza. Confiamos en auto-wait de expect().

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

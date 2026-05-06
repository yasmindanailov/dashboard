import { redirect } from 'next/navigation';

/**
 * /admin/settings — Sprint 15A Fase I.2 (ADR-080).
 *
 * Hub de settings admin. Sprint 15A solo entrega la categoría plugins
 * (ADR-080), por lo que la página redirige a `/admin/settings/plugins`
 * para no exponer una página vacía. Sprint 12 (P2.7 — Settings + KB)
 * reemplazará este redirect por un hub con todas las categorías
 * (`brand`, `numbering`, `kb`, `plugins`, ...) — el sidebar item ya
 * apunta canónicamente a `/admin/settings`.
 */
export default function AdminSettingsHubPage(): never {
  redirect('/admin/settings/plugins');
}

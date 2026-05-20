/**
 * quick-actions — Sprint 15C.II Fase F.12.4 (layout canónico, Amendment IV).
 *
 * Filtro canónico de las "acciones rápidas" del plugin que se muestran al
 * usuario (menú ⋯ del header en F.12.4; antes la barra `<ActionsBar>`).
 * Centraliza `INTERNAL_HELPER_SLUGS` (antes vivía duplicado en ActionsBar)
 * para una sola fuente de verdad. Módulo puro — sin `'use client'`.
 *
 * Doble filtro (ADR-077 Amendment A3.5 + Sprint 15C Fase J):
 *   1. `adminOnly` — UX: no mostrar al cliente un botón que recibiría 403
 *      (el backend wrapper sigue siendo defense-in-depth).
 *   2. `INTERNAL_HELPER_SLUGS` — slugs que el contrato declara como
 *      `inlineActions` por necesidad pero que NO deben renderizarse como
 *      botón standalone: se operan desde UI custom (modales / cards /
 *      páginas dedicadas). Ver el motivo de cada slug abajo.
 */
import type { ServiceAction } from '../../lib/api';

/**
 * Slugs operados desde UI custom, NO como botón rápido standalone:
 *   - `change_package` / `list_available_plans` — modal "Cambiar plan…"
 *     (card Operaciones).
 *   - `recalculate_provider_metrics` — card Operaciones (power-user).
 *   - `list_dns_records` / `add_dns_record` / `update_dns_record` /
 *     `delete_dns_record` — UI canónica DNS (`/services/[id]/dns`).
 *   - `suspend_service` / `unsuspend_service` — modal con motivo canónico
 *     (card Operaciones).
 *   - `open_app_admin` — requiere payload `{ appId }` de una instalación
 *     concreta; se opera desde `<AppShortcutsCard>` (per-app).
 * Cualquier slug futuro que requiera payload no-trivial o UI propia entra aquí.
 */
export const INTERNAL_HELPER_SLUGS = new Set<string>([
  'change_package',
  'list_available_plans',
  'recalculate_provider_metrics',
  'list_dns_records',
  'add_dns_record',
  'update_dns_record',
  'delete_dns_record',
  'suspend_service',
  'unsuspend_service',
  'open_app_admin',
]);

/**
 * Devuelve las acciones rápidas visibles para el viewer: filtra `adminOnly`
 * (si no es staff) + `INTERNAL_HELPER_SLUGS`. Resultado para el menú ⋯.
 */
export function filterQuickActions(
  actions: readonly ServiceAction[],
  isAdmin: boolean,
): ServiceAction[] {
  return actions
    .filter((action) => !action.adminOnly || isAdmin)
    .filter((action) => !INTERNAL_HELPER_SLUGS.has(action.slug));
}

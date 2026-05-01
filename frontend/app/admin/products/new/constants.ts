/* ═══════════════════════════════════════
   New Product — Constants & types
   Ref: DECISIONS.md §6, §7, §8, §27 + ADR-075 §A (aislamiento support_inside)
   ═══════════════════════════════════════ */

/**
 * Tipos creables desde `/admin/products`. NO incluye `support_inside` —
 * los planes Support Inside se gestionan desde la página dedicada
 * `/admin/support-inside-plans` (ADR-075). El backend además aplica
 * `SupportInsideIsolationGuard` que rechaza `POST/PATCH/DELETE` con
 * `type='support_inside'` salvo header interno `X-Aelium-Source:
 * support-inside-admin` (defense in depth).
 */
export const PRODUCT_TYPES_CREATABLE = [
  {
    value: 'hosting_web', label: 'Hosting Web', icon: '', isAddon: false,
    description: 'Planes de hosting web (Web Inicio, Web Pro, Web Business)',
    defaultProvisioner: 'enhance_cp',
  },
  {
    value: 'domain', label: 'Dominio', icon: '', isAddon: false,
    description: 'Registro y transferencia de dominios',
    defaultProvisioner: 'resellerclub',
  },
  {
    value: 'docker_service', label: 'Docker Service', icon: '', isAddon: false,
    description: 'Contenedores Docker (Nextcloud, OpenClaw, etc.)',
    defaultProvisioner: 'docker_engine',
  },
  // 'support_inside' — EXCLUIDO ADR-075. Crear/editar desde
  // /admin/support-inside-plans. Cualquier intento aquí lo rechaza el
  // SupportInsideIsolationGuard del backend.
  {
    value: 'we_do_it', label: 'We Do It For You', icon: '', isAddon: true,
    description: 'Addon por producto — desarrollo/configuración (§8)',
    defaultProvisioner: 'manual',
  },
  {
    value: 'custom_service', label: 'Proyecto Custom', icon: '', isAddon: false,
    description: 'Proyectos manuales a escala (ERP, CRM). Creación manual.',
    defaultProvisioner: 'manual',
  },
] as const;

/**
 * Alias retrocompatible: páginas que aún importan `PRODUCT_TYPES` reciben
 * la lista creable (sin `support_inside`). Cualquier UI que necesite la
 * lista completa de tipos para *etiquetar* (no crear) debe usar
 * `TYPE_LABELS` de `app/admin/products/types.ts`.
 */
export const PRODUCT_TYPES = PRODUCT_TYPES_CREATABLE;

export const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_time', label: 'Único' },
] satisfies { value: string; label: string }[];

export interface PricingRow {
  billing_cycle: string;
  price: string;
  setup_fee: string;
}


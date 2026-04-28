/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM — Portal helpers (ADR-066)
 * ═══════════════════════════════════════════════════════════════
 *
 * Tres portales raíz canónicos por audiencia:
 *   - admin   → /admin/*    (staff: superadmin, agent_*)
 *   - client  → /dashboard/* (cliente final)
 *   - partner → /partner/*  (Sprint 19, P3.17)
 *
 * Granularidad fina entre roles staff (agent_billing vs agent_support
 * vs agent_full vs superadmin) se resuelve dentro del Portal de
 * Administración con CASL + Sidebar filtering (ADR-067), no creando
 * un portal por rol.
 *
 * Las rutas legales / contractuales y la UX divergen por portal; el
 * Design System y los componentes UI se comparten (R16).
 */

export type PortalVariant = 'admin' | 'client' | 'partner';

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

const PARTNER_ROLES = new Set(['partner', 'partner_pending']);

/**
 * Resuelve el portal canónico para un rol dado. Default seguro: 'client'
 * (la audiencia más restringida) para no exponer funcionalidad staff
 * accidentalmente cuando el rol llega `undefined` por un edge-case.
 */
export function portalForRole(roleSlug?: string): PortalVariant {
  if (!roleSlug) return 'client';
  if (STAFF_ROLES.has(roleSlug)) return 'admin';
  if (PARTNER_ROLES.has(roleSlug)) return 'partner';
  return 'client';
}

const PORTAL_LABELS: Record<PortalVariant, string> = {
  admin: 'Portal de Administración',
  client: 'Portal de Cliente',
  partner: 'Portal de Partner',
};

/**
 * Texto del subtítulo bajo el logo del Sidebar para cada portal. Se
 * muestra en `<PortalBadge>` (componente del Design System).
 */
export function portalLabelForRole(roleSlug?: string): string {
  return PORTAL_LABELS[portalForRole(roleSlug)];
}

/**
 * URL raíz del portal. Útil para `landingForRole(roleSlug)` en
 * `app/page.tsx` y para guards que redirigen a la audiencia correcta.
 *
 * Nota: hasta Sprint 19 (Partner Module), partner redirige a /dashboard
 * porque /partner aún no existe. Cuando Sprint 19 cierre, basta con
 * cambiar la línea `partner` aquí.
 */
const PORTAL_ROOTS: Record<PortalVariant, string> = {
  admin: '/admin',
  client: '/dashboard',
  partner: '/dashboard', // TODO Sprint 19: '/partner'
};

export function portalRootForRole(roleSlug?: string): string {
  return PORTAL_ROOTS[portalForRole(roleSlug)];
}

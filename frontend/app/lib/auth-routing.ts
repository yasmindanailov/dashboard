/**
 * Auth routing helpers — Sprint 13 §13.AUTH Fase E.
 *
 * Lógica pura (sin 'server-only') para decidir el landing post-login según
 * el rol. Usado por:
 *   - Server Components wrapper de pages auth-públicas (redirect si ya hay
 *     sesión válida).
 *   - Server Actions (`loginAction`, `verify2faAction`) para el redirect
 *     final tras setear cookies.
 *
 * Ref: ADR-066 (3 portales raíz) + DC.7 (staff → /admin, cliente/partner → /dashboard).
 */

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

export function landingForRole(roleSlug?: string | null): string {
  if (roleSlug && STAFF_ROLES.has(roleSlug)) return '/admin';
  return '/dashboard';
}

/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM — Frontend Permissions
 * ═══════════════════════════════════════════════════════════════
 *
 * Subset of backend permissions.ts for sidebar filtering and
 * route protection. Must stay in sync with backend.
 *
 * This file does NOT enforce security — that's the backend's job.
 * This only controls UI visibility and navigation.
 *
 * Fuente de verdad: backend/src/core/casl/permissions.ts
 *
 * Sprint 13.5 Fase E (DC.15): el endpoint canónico
 * `GET /api/v1/auth/me/permissions` (helper `authApi.myPermissions`)
 * expone la matriz vigente del usuario. La hidratación al `AuthContext`
 * post-login (que sustituirá el matrix hardcoded de abajo por el
 * server-side) queda diferida a **Sprint 13 §13.AUTH** cuando llegue
 * la migración a Server Components + cookies httpOnly (ADR-078). Hasta
 * entonces, este matrix sirve como fallback bootstrap pre-hidratación
 * y como referencia para `AppModule` types. **Si añades un Subject
 * nuevo, añádelo en backend/permissions.ts y aquí — el endpoint sólo
 * filtra el subset visible al rol actual.**
 */

// ─── Modules (matches backend Subject enum for sidebar items) ──

export type AppModule =
  | 'Dashboard'
  | 'Client'
  | 'Product'
  | 'Invoice'
  | 'Conversation'
  | 'Task'
  | 'AuditLog'
  | 'Server'
  | 'Setting'
  // ADR-067 — Subjects admin-puro plataforma (solo superadmin).
  | 'NotificationTemplate'
  | 'Job'
  // ADR-080 — Plugin Framework admin-puro (manejan credenciales del proveedor).
  | 'Plugin'
  | 'Promotion'
  | 'KnowledgeBase'
  | 'ErrorLog'
  | 'Partner'
  | 'Referral'
  | 'Service'
  | 'SupportInside'
  | 'PartnerClient'
  | 'PartnerCommission'
  | 'PartnerPayout'
  | 'PartnerTicket'
  | 'Profile';

// ─── Sidebar permissions by role ────────────────────────────────
//
// Maps role slug → array of modules the role can see in the sidebar.
// Derived from DECISIONS.md §14, §35 and PARTNER_DECISIONS.md.

export const SIDEBAR_PERMISSIONS: Record<string, AppModule[]> = {
  superadmin: [
    'Dashboard', 'Client', 'Product', 'Invoice',
    'Conversation', 'Task', 'AuditLog', 'Server',
    'Setting', 'Promotion', 'KnowledgeBase', 'ErrorLog',
    // ADR-067 — items admin-puro plataforma (solo superadmin).
    'NotificationTemplate', 'Job',
    // ADR-080 — Plugin Framework admin-puro.
    'Plugin',
    'Partner', 'Referral',
    // ADR-075 — gestión de planes Support Inside (Manage.SupportInside).
    'SupportInside',
    // Sprint 11 Fase 11.D — vista admin federada de servicios contratados.
    'Service',
  ],
  agent_full: [
    'Dashboard', 'Client', 'Product', 'Invoice',
    'Conversation', 'Task', 'AuditLog',
    'Promotion', 'KnowledgeBase', 'ErrorLog', 'Partner',
    // ADR-075 — agent_full puede editar planes Support Inside.
    'SupportInside',
    // Sprint 11 Fase 11.D — Manage.Service incluye reprovision/deprovision.
    'Service',
  ],
  agent_billing: [
    'Dashboard', 'Client', 'Invoice', 'Task',
    // Sprint 11 Fase 11.D — Read.Service para visibilidad cross-billing.
    'Service',
  ],
  agent_support: [
    'Dashboard', 'Client', 'Conversation', 'Task',
    'KnowledgeBase',
    // Sprint 11 Fase 11.D — Read.Service para diagnóstico desde tickets.
    'Service',
  ],
  client: [
    'Dashboard', 'Service', 'Invoice',
    'Conversation', 'SupportInside', 'Referral',
  ],
  partner_pending: [
    'Dashboard',
  ],
  partner: [
    'Dashboard', 'PartnerClient', 'PartnerCommission',
    'PartnerPayout', 'PartnerTicket', 'Partner',
  ],
};

// ─── Route permissions ──────────────────────────────────────────
//
// Maps dashboard routes to the required module permission.
// Used by the route guard to check if the user can access a page.

export const ROUTE_PERMISSIONS: Record<string, AppModule> = {
  // ── Cliente / Compartidas (Portal de Cliente — ADR-066) ──
  '/dashboard': 'Dashboard',
  '/dashboard/billing': 'Invoice',
  '/dashboard/support': 'Conversation',
  // Client-specific
  '/dashboard/services': 'Service',
  // Sprint 15D Fase 15D.F.4 — comercio de dominios (buscador + carrito + "Mis
  // dominios" + gestión). Los dominios SON services (product.type='domain'): el
  // CASL del backend NO tiene un Subject `Domain` separado — `Service` es el
  // paraguas. Por eso reusamos `Service` aquí en vez de inventar un Subject que
  // driftearía respecto a backend/permissions.ts. Cubre /search, /cart y /[id].
  '/dashboard/domains': 'Service',
  // Sprint 15D Fase 15D.F.4 — tienda + carrito unificado (gateados por Invoice,
  // que el cliente tiene; el checkout requiere Create.Invoice).
  '/dashboard/store': 'Invoice',
  '/dashboard/cart': 'Invoice',
  '/dashboard/support-inside': 'SupportInside',
  '/dashboard/referrals': 'Referral',
  // Partner-specific (mantenido en /dashboard hasta Sprint 19; ese sprint
  // mueve los items partner a /partner/*).
  '/dashboard/my-clients': 'PartnerClient',
  '/dashboard/commissions': 'PartnerCommission',
  '/dashboard/payouts': 'PartnerPayout',
  '/dashboard/tickets': 'PartnerTicket',
  '/dashboard/my-link': 'Partner',

  // ── Staff (Portal de Administración — Sprint 9.6 + ADR-066) ──
  '/admin': 'Dashboard',
  '/admin/clients': 'Client',
  '/admin/products': 'Product',
  '/admin/billing': 'Invoice',
  '/admin/support': 'Conversation',
  '/admin/support/chats': 'Conversation',
  '/admin/tasks': 'Task',
  '/admin/settings': 'Setting',
  // ADR-080 Sprint 15A — Plugin Framework admin-puro (manejan credenciales).
  '/admin/settings/plugins': 'Plugin',
  '/admin/error-log': 'ErrorLog',
  '/admin/jobs/failed': 'Job',
  '/admin/notifications/templates': 'NotificationTemplate',
  // Sprint 11 Fase 11.D — vista admin federada (ADR-066 portal admin).
  '/admin/services': 'Service',
  // ADR-075 — Support Inside admin (sólo superadmin + agent_full por
  // Manage.SupportInside; ver SIDEBAR_PERMISSIONS).
  '/admin/support-inside-plans': 'SupportInside',
};

/**
 * Check if a role has access to a specific module.
 */
export function canAccess(roleSlug: string, module: AppModule): boolean {
  const allowed = SIDEBAR_PERMISSIONS[roleSlug];
  if (!allowed) return false;
  return allowed.includes(module);
}

/**
 * Check if a role has access to a specific route.
 * Returns true if the route has no permission mapping (permissive by default for unmapped routes).
 */
export function canAccessRoute(roleSlug: string, pathname: string): boolean {
  // Find the most specific matching route
  const sortedRoutes = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);

  for (const route of sortedRoutes) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      const requiredModule = ROUTE_PERMISSIONS[route];
      return canAccess(roleSlug, requiredModule);
    }
  }

  // No permission mapping for this route → allow (it's likely a sub-page of an allowed route)
  return true;
}

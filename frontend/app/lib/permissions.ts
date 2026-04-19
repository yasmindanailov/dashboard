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
    'Partner', 'Referral',
  ],
  agent_full: [
    'Dashboard', 'Client', 'Product', 'Invoice',
    'Conversation', 'Task', 'AuditLog',
    'Promotion', 'KnowledgeBase', 'ErrorLog', 'Partner',
  ],
  agent_billing: [
    'Dashboard', 'Client', 'Invoice', 'Task',
  ],
  agent_support: [
    'Dashboard', 'Client', 'Conversation', 'Task',
    'KnowledgeBase',
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
  '/dashboard': 'Dashboard',
  '/dashboard/clients': 'Client',
  '/dashboard/products': 'Product',
  '/dashboard/billing': 'Invoice',
  '/dashboard/support': 'Conversation',
  '/dashboard/tasks': 'Task',
  '/dashboard/audit': 'AuditLog',
  '/dashboard/infrastructure': 'Server',
  '/dashboard/settings': 'Setting',
  '/dashboard/promotions': 'Promotion',
  '/dashboard/knowledge-base': 'KnowledgeBase',
  '/dashboard/errors': 'ErrorLog',
  '/dashboard/partners': 'Partner',
  '/dashboard/referrals': 'Referral',
  // Client-specific
  '/dashboard/services': 'Service',
  '/dashboard/support-inside': 'SupportInside',
  // Partner-specific
  '/dashboard/my-clients': 'PartnerClient',
  '/dashboard/commissions': 'PartnerCommission',
  '/dashboard/payouts': 'PartnerPayout',
  '/dashboard/tickets': 'PartnerTicket',
  '/dashboard/my-link': 'Partner',
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

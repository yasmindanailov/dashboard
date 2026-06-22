'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { canAccess, type AppModule } from '../lib/permissions';
import { portalForRole } from '../lib/portal';
import { PortalBadge } from '../components/ui';
import styles from './Sidebar.module.css';

/* ═══════════════════════════════════════
   Sidebar — Navigation panel (desktop + mobile)
   Renders role-filtered navigation items
   with collapsible desktop and drawer mobile.
   Ref: UI_SPEC.md §2.0, DECISIONS.md §32
   ═══════════════════════════════════════ */

interface NavItem {
  label: string;
  href: string;
  requiredModule: AppModule;
  icon: React.ReactNode;
  section?: 'main' | 'admin' | 'partner' | 'client';
}

const ICON = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  clients: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  products: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  billing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  support: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  tasks: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  services: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  // Sprint 15D Fase 15D.F.4 — globo para el portal de dominios.
  domains: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  commission: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  link: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  supportInside: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2l9 4v6c0 5-3.6 9.3-9 10-5.4-.7-9-5-9-10V6l9-4z" />
      <path d="M12 11v4" />
      <path d="M12 8h.01" />
    </svg>
  ),
};

/**
 * Sprint 9.6 (DC.7 + ADR-066): los items admin-puro (`section: 'admin'`)
 * fueron movidos al árbol staff `/admin/*` y ahora viven en
 * `app/admin/AdminSidebar.tsx`. El Sidebar cliente sólo muestra items
 * `main` (Dashboard cliente landing role-aware), `client` (Mis servicios,
 * Mis facturas, Soporte, Transparencia) y `partner` (hasta Sprint 19,
 * que los moverá a `/partner/*`).
 *
 * Si llega un staff a `/dashboard` por error de routing, el AdminLayout
 * + landingForRole() lo redirigen a `/admin` antes de renderizar este
 * sidebar.
 */
const ALL_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', requiredModule: 'Dashboard', icon: ICON.dashboard, section: 'main' },
  { label: 'Mis servicios', href: '/dashboard/services', requiredModule: 'Service', icon: ICON.services, section: 'client' },
  // Sprint 15D Fase 15D.F.4 — comercio de dominios. Gateado por `Service` (no
  // existe Subject `Domain`: los dominios son services type='domain'). El
  // buscador/carrito/detalle cuelgan de /dashboard/domains.
  { label: 'Dominios', href: '/dashboard/domains', requiredModule: 'Service', icon: ICON.domains, section: 'client' },
  { label: 'Mis facturas', href: '/dashboard/billing', requiredModule: 'Invoice', icon: ICON.billing, section: 'client' },
  { label: 'Soporte', href: '/dashboard/support', requiredModule: 'Conversation', icon: ICON.support, section: 'client' },
  // ADR-061 + ADR-075 — entrada propia para que el cliente acceda al
  // comparador (si no tiene plan) o a la gestión (slots/canales/cancelar).
  { label: 'Support Inside', href: '/dashboard/support-inside', requiredModule: 'SupportInside', icon: ICON.supportInside, section: 'client' },
  { label: 'Mis clientes', href: '/dashboard/my-clients', requiredModule: 'PartnerClient', icon: ICON.clients, section: 'partner' },
  { label: 'Comisiones', href: '/dashboard/commissions', requiredModule: 'PartnerCommission', icon: ICON.commission, section: 'partner' },
  { label: 'Mi enlace', href: '/dashboard/my-link', requiredModule: 'Partner', icon: ICON.link, section: 'partner' },
];

function getNavItemsForRole(roleSlug: string): NavItem[] {
  const isClient = roleSlug === 'client';
  const isPartner = ['partner', 'partner_pending'].includes(roleSlug);

  return ALL_NAV_ITEMS.filter((item) => {
    if (!canAccess(roleSlug, item.requiredModule)) return false;
    // 'admin' ya no se renderiza desde aquí (DC.7) — defensa por si algún
    // futuro item olvida el rol y queda mal etiquetado.
    if (item.section === 'admin') return false;
    if (item.section === 'client' && !isClient) return false;
    if (item.section === 'partner' && !isPartner) return false;
    return true;
  });
}

/* ── Component ── */

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const navItems = getNavItemsForRole(roleSlug);

  const sidebarContent = (
    <aside className={styles.sidebar}>
      {/* Logo + PortalBadge (ADR-066): identidad del portal cliente/partner.
          En estado colapsado solo se muestra el cuadrado "A". Cuando se
          expande, el PortalBadge resuelve "aelium" + subtítulo según rol
          ("Portal de Cliente" o "Portal de Partner"). */}
      <div className={styles.logoArea}>
        <Link
          href="/dashboard"
          className={styles.logoLink}
          onClick={onMobileClose}
          aria-label="Inicio del portal"
        >
          <div className={styles.logoIcon} aria-hidden="true">A</div>
          {!collapsed && (
            <PortalBadge variant={portalForRole(roleSlug)} logo="aelium" />
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {navItems.map((item) => {
          /* Active state:
             - Exact match always wins
             - startsWith match, BUT only if no other nav item has a
               longer href that also matches (prevents /dashboard/support
               from staying active when /dashboard/support/chats matches) */
          const startsMatch = item.href !== '/dashboard'
            && pathname.startsWith(item.href + '/');
          const hasBetterMatch = startsMatch && navItems.some(
            (other) => other.href !== item.href
              && other.href.startsWith(item.href + '/')
              && pathname.startsWith(other.href),
          );
          const isActive = pathname === item.href || (startsMatch && !hasBetterMatch);
          return (
            <Link
              key={item.href + item.section}
              href={item.href}
              onClick={onMobileClose}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : styles.navItemDefault}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className={styles.collapseArea}>
        <button onClick={onToggle} className={styles.collapseBtn} title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}>
          <svg
            width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="1.5"
            className={`${styles.collapseIcon} ${collapsed ? styles.collapseIconRotated : ''}`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className={styles.desktop} style={{ width: collapsed ? '72px' : '260px' }}>
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className={styles.mobileOverlay}>
          <div className={styles.mobileBackdrop} onClick={onMobileClose} />
          <div className={styles.mobileDrawer}>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

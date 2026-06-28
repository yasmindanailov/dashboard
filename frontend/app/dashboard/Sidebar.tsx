'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '../lib/auth-context';
import { portalForRole } from '../lib/portal';
import { PortalBadge, BrandMark } from '../components/ui';
import { CollapseToggle } from '../_shared/shell/CollapseToggle';

import { getNavItemsForRole } from './nav-items';
import { SidebarSupportSlot } from './_components/SidebarSupportSlot';
import styles from './Sidebar.module.css';

/* ═══════════════════════════════════════
   Sidebar cliente (portal /dashboard) — F2: reconstruido 1:1 con el mockup
   Shell.dc.html. Nav rol-aware (PBAC/CASL, en nav-items.ts), skin "Tarjeta"
   (activo = tarjeta blanca + ring + rombo), tarjeta de soporte en el footer,
   toggle flotante. Ref: UI_SPEC.md §2.0 · ADR-066 (3 portales).
   ═══════════════════════════════════════ */

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Abre el panel de soporte; con id → muestra esa conversación, sin id → el listado. */
  onOpenSupport: (conversationId?: string) => void;
}

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  onOpenSupport,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const navItems = getNavItemsForRole(roleSlug);

  const renderAside = (withToggle: boolean) => (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.logoArea}>
        <Link href="/dashboard" className={styles.logoLink} onClick={onMobileClose} aria-label="Inicio del portal">
          <BrandMark size={30} intro />
          {!collapsed && <PortalBadge variant={portalForRole(roleSlug)} logo="aelium" />}
        </Link>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          /* Active: match exacto gana; startsWith solo si ningún otro item con
             href más largo también matchea (evita que /dashboard/support quede
             activo en /dashboard/support/chats). */
          const startsMatch = item.href !== '/dashboard' && pathname.startsWith(item.href + '/');
          const hasBetterMatch =
            startsMatch &&
            navItems.some(
              (other) =>
                other.href !== item.href &&
                other.href.startsWith(item.href + '/') &&
                pathname.startsWith(other.href),
            );
          const isActive = pathname === item.href || (startsMatch && !hasBetterMatch);
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.section}
              href={item.href}
              onClick={onMobileClose}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.6} className={styles.navIcon} aria-hidden="true" />
              {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
              {!collapsed && isActive && <span className={styles.navMarker} aria-hidden="true" />}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <SidebarSupportSlot collapsed={collapsed} onOpenSupport={onOpenSupport} />
      </div>

      {withToggle && <CollapseToggle collapsed={collapsed} onToggle={onToggle} />}
    </aside>
  );

  return (
    <>
      <div
        className={styles.desktop}
        style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
      >
        {renderAside(true)}
      </div>

      {mobileOpen && (
        <div className={styles.mobileOverlay}>
          <div className={styles.mobileBackdrop} onClick={onMobileClose} />
          <div className={styles.mobileDrawer}>{renderAside(false)}</div>
        </div>
      )}
    </>
  );
}

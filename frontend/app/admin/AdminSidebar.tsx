'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Package,
  ShieldCheck,
  Monitor,
  CreditCard,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '../lib/auth-context';
import { canAccess, type AppModule } from '../lib/permissions';
import { PortalBadge, BrandMark } from '../components/ui';
import { CollapseToggle } from '../_shared/shell/CollapseToggle';

import { AdminLiveChatCard, AdminLiveChatMini } from './_components/AdminLiveChatCard';
import styles from './admin-sidebar.module.css';

/* ═══════════════════════════════════════
   AdminSidebar (portal /admin) — F2: reconstruido 1:1 con admin/Shell.dc.html.

   **Decisión Yasmin (F2): el sidebar admin = un solo grupo "Operaciones" (7).**
   Las tools de plataforma (Settings, Equipo, Error Log, Jobs DLQ, Plantillas,
   Borrado) salen del nav → viven como cards en Settings (reskin F4). "Chat en
   vivo" se reubica en la tarjeta del footer; "Tareas" en el pill del topbar. Las
   rutas siguen vivas, solo se desenlazan del sidebar.

   Visibilidad por rol staff vía `canAccess` (ADR-067, espejo del backend).
   ═══════════════════════════════════════ */

interface NavItem {
  label: string;
  href: string;
  requiredModule: AppModule;
  icon: LucideIcon;
}

const ALL_ITEMS: NavItem[] = [
  { label: 'Inicio', href: '/admin', requiredModule: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clientes', href: '/admin/clients', requiredModule: 'Client', icon: Users },
  { label: 'Productos', href: '/admin/products', requiredModule: 'Product', icon: Package },
  // ADR-075 — gestión de planes Support Inside (superadmin + agent_full).
  { label: 'Support Inside', href: '/admin/support-inside-plans', requiredModule: 'SupportInside', icon: ShieldCheck },
  { label: 'Servicios', href: '/admin/services', requiredModule: 'Service', icon: Monitor },
  { label: 'Facturación', href: '/admin/billing', requiredModule: 'Invoice', icon: CreditCard },
  { label: 'Soporte', href: '/admin/support', requiredModule: 'Conversation', icon: MessageSquare },
];

const STAFF_ROLES = new Set(['superadmin', 'agent_full', 'agent_billing', 'agent_support']);

function getItemsForRole(roleSlug: string): NavItem[] {
  if (!STAFF_ROLES.has(roleSlug)) return [];
  return ALL_ITEMS.filter((item) => canAccess(roleSlug, item.requiredModule));
}

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function AdminSidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const items = getItemsForRole(roleSlug);

  const openChats = () => {
    onMobileClose();
    router.push('/admin/support/chats');
  };

  const renderAside = (withToggle: boolean) => (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.brand}>
        <Link
          href="/admin"
          className={styles.brandLink}
          aria-label="Inicio del Panel de administración"
          onClick={onMobileClose}
        >
          <BrandMark size={28} />
          {!collapsed && <PortalBadge variant="admin" logo="aelium" />}
        </Link>
      </div>

      <nav className={styles.nav}>
        {items.length > 0 && (
          <div className={styles.section}>
            {!collapsed && <span className={styles.sectionTitle}>Operaciones</span>}
            <ul className={styles.list}>
              {items.map((item) => {
                /* Active: match exacto gana; startsWith solo si ningún otro item
                   con href más largo también matchea (así "Inicio" /admin no se
                   activa en toda subruta y "Soporte" no se confunde con
                   support-inside-plans). */
                const startsMatch = item.href !== '/admin' && pathname.startsWith(item.href + '/');
                const hasBetterMatch =
                  startsMatch &&
                  items.some(
                    (other) =>
                      other.href !== item.href &&
                      other.href.startsWith(item.href + '/') &&
                      pathname.startsWith(other.href),
                  );
                const active = pathname === item.href || (startsMatch && !hasBetterMatch);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onMobileClose}
                      className={`${styles.link} ${active ? styles.linkActive : ''}`}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={19} strokeWidth={1.6} className={styles.icon} aria-hidden="true" />
                      {!collapsed && <span className={styles.label}>{item.label}</span>}
                      {!collapsed && active && <span className={styles.marker} aria-hidden="true" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      <div className={styles.footer}>
        {collapsed ? (
          <AdminLiveChatMini waitingCount={0} onOpenChats={openChats} />
        ) : (
          <AdminLiveChatCard waitingCount={0} chats={[]} onOpenChats={openChats} />
        )}
      </div>

      {withToggle && <CollapseToggle collapsed={collapsed} onToggle={onToggle} />}
    </aside>
  );

  return (
    <>
      <div
        className={styles.desktop}
        style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width-admin)' }}
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

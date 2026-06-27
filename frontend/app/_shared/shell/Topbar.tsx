'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Search, User, Settings, LogOut, ShieldCheck, ChevronDown } from 'lucide-react';

import { useAuth } from '../../lib/auth-context';
import { canAccess } from '../../lib/permissions';
import { Dropdown, type DropdownItem } from '../../components/ui';

import NotificationBell from './NotificationBell';
import styles from './Topbar.module.css';

/* ═══════════════════════════════════════
   Topbar — header del shell (cliente + admin). F2: reconstruido por slots
   1:1 con los mockups.
     - `left`: migas (cliente) o título (admin), compuesto por el shell.
     - `onOpenCommandPalette`: si se pasa, renderiza el trigger ⌘K (admin).
       El cliente NO lo pasa → su topbar no tiene búsqueda (mockup cliente).
     - `actions`: extras antes de la campana (admin → TasksPill).
   La campana y el menú de perfil son comunes. El botón de soporte del cliente
   se retiró: el soporte vive ahora en la tarjeta del sidebar.
   Ref: UI_SPEC.md §2.0.
   ═══════════════════════════════════════ */

interface TopbarProps {
  /** Ancho del sidebar (expresión CSS) para el offset del topbar fijo. */
  sidebarWidth: string;
  onMobileMenuOpen: () => void;
  left: ReactNode;
  onOpenCommandPalette?: () => void;
  actions?: ReactNode;
}

const STAFF_ROLES = ['superadmin', 'agent_full', 'agent_billing', 'agent_support'];

export default function Topbar({
  sidebarWidth,
  onMobileMenuOpen,
  left,
  onOpenCommandPalette,
  actions,
}: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const roleSlug = user?.role?.slug || '';
  const isClient = roleSlug === 'client';
  const hasSetting = canAccess(roleSlug, 'Setting');

  // ADR-066: el staff vive en /admin/* (su perfil en /admin/profile);
  // cliente/partner en /dashboard/profile.
  const profilePath = STAFF_ROLES.includes(roleSlug) ? '/admin/profile' : '/dashboard/profile';

  const profileItems: DropdownItem[] = [
    { label: 'Mi perfil', icon: <User size={16} strokeWidth={1.6} />, onClick: () => router.push(profilePath) },
    ...(isClient
      ? [
          {
            label: 'Transparencia de datos',
            icon: <ShieldCheck size={16} strokeWidth={1.6} />,
            onClick: () => router.push('/dashboard/transparency'),
          },
        ]
      : []),
    ...(hasSetting
      ? [
          {
            label: 'Configuración',
            icon: <Settings size={16} strokeWidth={1.6} />,
            onClick: () => router.push('/admin/settings'),
          },
        ]
      : []),
    { label: '', onClick: () => {}, divider: true },
    { label: 'Cerrar sesión', icon: <LogOut size={16} strokeWidth={1.6} />, onClick: logout, danger: true },
  ];

  return (
    <header
      className={styles.topbar}
      style={
        {
          '--topbar-left': sidebarWidth,
          '--topbar-width': `calc(100% - ${sidebarWidth})`,
        } as React.CSSProperties
      }
    >
      <div className={styles.left}>
        <button
          className={`${styles.iconBtn} ${styles.mobileOnly}`}
          onClick={onMobileMenuOpen}
          title="Abrir menú"
          aria-label="Abrir menú"
        >
          <Menu size={22} strokeWidth={1.6} aria-hidden="true" />
        </button>
        {left}
      </div>

      <div className={styles.right}>
        {onOpenCommandPalette && (
          <button
            className={styles.searchTrigger}
            onClick={onOpenCommandPalette}
            title="Buscar (Cmd+K)"
            aria-label="Buscar"
          >
            <Search size={16} strokeWidth={1.7} aria-hidden="true" />
            <span className={styles.searchLabel}>Buscar</span>
            <kbd className={styles.searchKbd}>⌘K</kbd>
          </button>
        )}

        {actions}

        <NotificationBell triggerClassName={styles.iconBtn} />

        <Dropdown
          items={profileItems}
          align="right"
          trigger={
            <div className={styles.profileTrigger}>
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>
                  {user?.first_name} {user?.last_name}
                </div>
                <div className={styles.profileRole}>{user?.role?.name || ''}</div>
              </div>
              <div className={styles.avatar}>
                {user?.first_name?.[0] || ''}
                {user?.last_name?.[0] || ''}
              </div>
              <ChevronDown size={15} strokeWidth={1.8} className={styles.profileChevron} aria-hidden="true" />
            </div>
          }
        />
      </div>
    </header>
  );
}

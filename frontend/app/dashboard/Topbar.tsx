'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { canAccess } from '../lib/permissions';
import { Dropdown, type DropdownItem } from '../components/ui';
import NotificationBell from './NotificationBell';
import styles from './Topbar.module.css';

/* ═══════════════════════════════════════
   Topbar — Dashboard Shell Header
   Elements (left → right):
      Mobile: [Hamburger]
      Desktop: [Cmd+K trigger]
      All:     [Support (client only)]
               [Notifications]
               [Profile dropdown]

   Ref: UI_SPEC.md §2.0, DESIGN_SYSTEM.md
   ═══════════════════════════════════════ */

/* ── SVG Icons (inline, stroke 1.5, 20×20) ── */

const IconSearch = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconSupport = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconHamburger = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const IconUser = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const IconSettings = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconLogout = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconChat = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const IconTicket = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

/* ── Component ── */

interface TopbarProps {
  sidebarCollapsed: boolean;
  onMobileMenuOpen: () => void;
  onOpenSupportPanel: () => void;
  onOpenCommandPalette?: () => void;
}

export default function Topbar({ sidebarCollapsed, onMobileMenuOpen, onOpenSupportPanel, onOpenCommandPalette }: TopbarProps) {
  const { user, logout } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const isClient = roleSlug === 'client';
  const hasSetting = canAccess(roleSlug, 'Setting');

  /* ── Profile dropdown items (P6.1: gate by permission) ── */
  const profileItems: DropdownItem[] = [
    { label: 'Mi perfil', icon: IconUser, onClick: () => {} },
    ...(hasSetting ? [{ label: 'Configuración', icon: IconSettings, onClick: () => {} }] : []),
    { label: '', onClick: () => {}, divider: true },
    { label: 'Cerrar sesión', icon: IconLogout, onClick: logout, danger: true },
  ];

  const sidebarWidth = sidebarCollapsed ? '72px' : '260px';

  return (
    <header
      className={styles.topbar}
      style={{
        '--topbar-left': sidebarWidth,
        '--topbar-width': `calc(100% - ${sidebarWidth})`,
      } as React.CSSProperties}
    >

      {/* Left — Hamburger (mobile) + Search (desktop) */}
      <div className={styles.left}>
        <button
          className={`${styles.iconBtn} ${styles.mobileOnly}`}
          onClick={onMobileMenuOpen}
          title="Abrir menú"
        >
          {IconHamburger}
        </button>

        {/* Cmd+K Search trigger (desktop only) */}
        <button className={styles.searchTrigger} title="Buscar (Cmd+K)" onClick={onOpenCommandPalette}>
          {IconSearch}
          <span>Buscar...</span>
          <kbd className={styles.searchKbd}>⌘K</kbd>
        </button>
      </div>

      {/* Right — Actions */}
      <div className={styles.right}>

        {/* Support button (client only) — UI_SPEC §P3 */}
        {isClient && <SupportButton onOpenChat={onOpenSupportPanel} />}

        {/* Notification bell — Sprint 9.5 (ADR-042 + ADR-065) */}
        <NotificationBell triggerClassName={styles.iconBtn} />

        {/* Profile dropdown */}
        <Dropdown
          items={profileItems}
          align="right"
          trigger={
            <div className={styles.profileTrigger}>
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>
                  {user?.first_name} {user?.last_name}
                </div>
                <div className={styles.profileRole}>
                  {user?.role?.name || ''}
                </div>
              </div>
              <div className={styles.avatar}>
                {user?.first_name?.[0] || ''}{user?.last_name?.[0] || ''}
              </div>
            </div>
          }
        />
      </div>
    </header>
  );
}

/* ── Support Button (Client Only) ── */

function SupportButton({ onOpenChat }: { onOpenChat: () => void }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Fetch unread count on mount + poll every 30s
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchUnread = async () => {
      try {
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
        const res = await fetch(`${API}/support/conversations/unread`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count ?? 0);
        }
      } catch (err) {
        console.warn('[Topbar] fetchUnread failed:', err);
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={styles.iconBtn}
        onClick={() => setOpen(!open)}
        title="Soporte"
        aria-expanded={open}
      >
        {IconSupport}
        {unreadCount > 0 && (
          <span className={styles.countBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.supportPanel}>
          <div className={styles.supportTitle}>¿Necesitas ayuda?</div>

          <button className={styles.supportItem} onClick={() => { setOpen(false); onOpenChat(); }}>
            {IconChat}
            <span>Chat en vivo</span>
          </button>
          <button className={styles.supportItem} onClick={() => setOpen(false)}>
            <Link href="/dashboard/support" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
              {IconTicket}
              <span>Abrir ticket</span>
            </Link>
          </button>

          <div className={styles.supportDivider} />

          <div className={styles.supportPlan}>
            Plan de soporte activo
            {' · '}
            <Link href="/dashboard/billing/checkout" className={styles.supportPlanLink}>
              Ver planes →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

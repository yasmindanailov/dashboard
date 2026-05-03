'use client';

/* Sprint 13 §13.AUTH Fase E (Modelo A): badge de tareas via Server
   Action `listTasksAction` (cero localStorage). El sidebar permanece
   CC porque mantiene state interactivo (hover, collapse, badge polling). */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { canAccess, type AppModule } from '../lib/permissions';
import { PortalBadge } from '../components/ui';
import { listTasksAction } from '../_shared/tasks/_actions';
import type { Task } from '../_shared/tasks/types';
import styles from './admin-sidebar.module.css';

/* ═══════════════════════════════════════
   AdminSidebar — Sidebar exclusivo del Portal de Administración
   (`/admin/*`). Sprint 9 Fase F (DC.7) + Sprint 9.6 (split retroactivo)
   + ADR-066 + ADR-067 + Sprint 13.5 Fase D (DC.14 paridad collapse +
   drawer móvil con Sidebar cliente).

   Visibilidad por rol staff vía `canAccess(roleSlug, requiredModule)` —
   misma fuente de verdad que el Sidebar cliente. La granularidad real
   vive en `SIDEBAR_PERMISSIONS` (lib/permissions.ts) que es réplica del
   backend (core/casl/permissions.ts).

   Matriz de visibilidad (ADR-067 + Sprint 9.6 §3):
     - superadmin    → todo
     - agent_full    → Clientes, Productos, Facturación, Soporte, Tareas
                       + Error Log (NO Settings, NO Plantillas, NO Jobs)
     - agent_billing → Clientes, Facturación, Tareas
     - agent_support → Clientes (read), Soporte, Tareas

   Props canónicas (Sprint 13.5 DC.14, espejo del Sidebar cliente):
     - collapsed: boolean — desktop colapsado (72px) o expandido (260px)
     - onToggle: () => void — toggle collapse desde el footer del sidebar
     - mobileOpen: boolean — drawer móvil abierto/cerrado
     - onMobileClose: () => void — cerrar drawer (click fuera o navegar)
   ═══════════════════════════════════════ */

interface NavItem {
  label: string;
  href: string;
  requiredModule: AppModule;
  icon: React.ReactNode;
  /** Sub-sección visual del Sidebar (cabecera de grupo). */
  section: 'operaciones' | 'plataforma';
}

const ICON = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
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
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
  errorLog: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  jobs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  templates: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4h16v16H4z" />
      <path d="M4 9h16" />
      <path d="M9 9v11" />
    </svg>
  ),
  supportInside: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2l9 4v6c0 5-3.6 9.3-9 10-5.4-.7-9-5-9-10V6l9-4z" />
      <path d="M12 11v4" />
      <path d="M12 8h.01" />
    </svg>
  ),
  services: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
};

const ALL_ITEMS: NavItem[] = [
  // ── Operaciones de negocio (visibilidad granular por CASL) ──
  { label: 'Inicio', href: '/admin', requiredModule: 'Dashboard', icon: ICON.home, section: 'operaciones' },
  { label: 'Clientes', href: '/admin/clients', requiredModule: 'Client', icon: ICON.clients, section: 'operaciones' },
  { label: 'Productos', href: '/admin/products', requiredModule: 'Product', icon: ICON.products, section: 'operaciones' },
  // ADR-075 — gestión de planes Support Inside aislada del CRUD genérico.
  // Visible para superadmin + agent_full (Manage.SupportInside).
  { label: 'Support Inside', href: '/admin/support-inside-plans', requiredModule: 'SupportInside', icon: ICON.supportInside, section: 'operaciones' },
  // Sprint 11 Fase 11.D — vista admin federada de servicios contratados.
  { label: 'Servicios', href: '/admin/services', requiredModule: 'Service', icon: ICON.services, section: 'operaciones' },
  { label: 'Facturación', href: '/admin/billing', requiredModule: 'Invoice', icon: ICON.billing, section: 'operaciones' },
  { label: 'Soporte', href: '/admin/support', requiredModule: 'Conversation', icon: ICON.support, section: 'operaciones' },
  { label: 'Chat en vivo', href: '/admin/support/chats', requiredModule: 'Conversation', icon: ICON.chat, section: 'operaciones' },
  { label: 'Tareas', href: '/admin/tasks', requiredModule: 'Task', icon: ICON.tasks, section: 'operaciones' },

  // ── Plataforma (sólo superadmin — ADR-067 Subjects nuevos + Setting) ──
  { label: 'Settings', href: '/admin/settings', requiredModule: 'Setting', icon: ICON.settings, section: 'plataforma' },
  { label: 'Error Log', href: '/admin/error-log', requiredModule: 'ErrorLog', icon: ICON.errorLog, section: 'plataforma' },
  { label: 'Jobs en DLQ', href: '/admin/jobs/failed', requiredModule: 'Job', icon: ICON.jobs, section: 'plataforma' },
  { label: 'Plantillas notificaciones', href: '/admin/notifications/templates', requiredModule: 'NotificationTemplate', icon: ICON.templates, section: 'plataforma' },
];

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

function getItemsForRole(roleSlug: string): NavItem[] {
  if (!STAFF_ROLES.has(roleSlug)) return [];
  return ALL_ITEMS.filter((item) => canAccess(roleSlug, item.requiredModule));
}

/* ── Badge "Tareas" — Sprint 16 / ADR-079 §3.11.
   Counter = tasks `assigned_to=current_user AND status IN ('pending',
   'in_progress')`. Tono:
     - rojo  → hay alguna `not_completed_in_time` (vencidas).
     - naranja → alguna vence en <2h.
     - neutro → resto.
   Refresco cada 60s — ligero (1 query con limit 50). */
const REFRESH_INTERVAL_MS = 60_000;
const SOON_DUE_MS = 2 * 60 * 60 * 1000;

interface TasksBadge {
  count: number;
  tone: 'neutral' | 'warn' | 'danger';
}

function useTasksBadge(enabled: boolean): TasksBadge {
  const [badge, setBadge] = useState<TasksBadge>({ count: 0, tone: 'neutral' });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const result = await listTasksAction({ scope: 'mine', limit: 50 });
      if (cancelled || !result.ok) return;
      const list = (result.tasks.data ?? []) as Task[];
      const open = list.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress',
      );
      const overdue = open.some(
        (t) => t.status === 'not_completed_in_time' || isOverdue(t),
      );
      const now = Date.now();
      const soonDue = open.some(
        (t) =>
          t.due_date &&
          new Date(t.due_date).getTime() - now <= SOON_DUE_MS &&
          new Date(t.due_date).getTime() > now,
      );
      setBadge({
        count: open.length,
        tone: overdue ? 'danger' : soonDue ? 'warn' : 'neutral',
      });
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return badge;
}

function isOverdue(t: Task): boolean {
  if (!t.due_date) return false;
  return new Date(t.due_date).getTime() < Date.now();
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
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const items = getItemsForRole(roleSlug);
  const tasksBadge = useTasksBadge(STAFF_ROLES.has(roleSlug));

  const operacionesItems = items.filter((i) => i.section === 'operaciones');
  const plataformaItems = items.filter((i) => i.section === 'plataforma');

  const renderLink = (item: NavItem) => {
    const active =
      pathname === item.href || pathname?.startsWith(`${item.href}/`);
    const showBadge =
      item.href === '/admin/tasks' && tasksBadge.count > 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onMobileClose}
          className={`${styles.link} ${active ? styles.linkActive : ''}`}
          aria-current={active ? 'page' : undefined}
          title={collapsed ? item.label : undefined}
        >
          <span className={styles.icon}>{item.icon}</span>
          {!collapsed && <span className={styles.label}>{item.label}</span>}
          {showBadge && (
            <span
              className={`${styles.badge} ${styles[`badge_${tasksBadge.tone}`]} ${
                collapsed ? styles.badgeCollapsed : ''
              }`}
              aria-label={`${tasksBadge.count} tareas pendientes`}
            >
              {tasksBadge.count > 99 ? '99+' : tasksBadge.count}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const sidebarContent = (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Link
          href="/admin"
          className={styles.brandLink}
          aria-label="Inicio Portal de Administración"
          onClick={onMobileClose}
        >
          <span className={styles.brandMark} aria-hidden="true">A</span>
          {!collapsed && <PortalBadge variant="admin" logo="Aelium" />}
        </Link>
      </div>

      <nav className={styles.nav}>
        {operacionesItems.length > 0 && (
          <div className={styles.section}>
            {!collapsed && (
              <span className={styles.sectionTitle}>Operaciones</span>
            )}
            <ul className={styles.list}>{operacionesItems.map(renderLink)}</ul>
          </div>
        )}

        {plataformaItems.length > 0 && (
          <div className={styles.section}>
            {!collapsed && (
              <span className={styles.sectionTitle}>Plataforma</span>
            )}
            <ul className={styles.list}>{plataformaItems.map(renderLink)}</ul>
          </div>
        )}
      </nav>

      {/* Collapse toggle (sólo desktop — el drawer móvil se cierra
          haciendo click en backdrop o seleccionando un item).
          Espejo del Sidebar cliente §collapseArea. */}
      <div className={styles.collapseArea}>
        <button
          type="button"
          onClick={onToggle}
          className={styles.collapseBtn}
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`${styles.collapseIcon} ${
              collapsed ? styles.collapseIconRotated : ''
            }`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar (toggleable collapse) */}
      <div
        className={styles.desktop}
        style={{ width: collapsed ? '72px' : '260px' }}
      >
        {sidebarContent}
      </div>

      {/* Mobile overlay (drawer + backdrop) — espejo del Sidebar cliente. */}
      {mobileOpen && (
        <div className={styles.mobileOverlay}>
          <div className={styles.mobileBackdrop} onClick={onMobileClose} />
          <div className={styles.mobileDrawer}>{sidebarContent}</div>
        </div>
      )}
    </>
  );
}

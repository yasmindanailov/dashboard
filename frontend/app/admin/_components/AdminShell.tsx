'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { canAccessRoute } from '../../lib/permissions';
import NoPermission from '../../components/ui/NoPermission';
import { ToastProvider, CommandPalette } from '../../components/ui';
import Topbar from '../../_shared/shell/Topbar';
import AdminSidebar from '../AdminSidebar';
import { PresenceHeartbeat } from '../../_shared/presence/PresenceHeartbeat';

import { TasksPill } from './TasksPill';
import { getAdminTitle } from './page-title';
import styles from '../admin-layout.module.css';

/* ═══════════════════════════════════════
   AdminShell — CC con todo el estado UI del shell admin.
   Sprint 13 §13.AUTH Fase E (Modelo A): el SC padre
   `app/admin/layout.tsx` ya garantizó autenticación + rol staff.
   Aquí solo gestionamos: sidebar collapse, mobile drawer, command
   palette, route-level permission check granular.

   La preferencia `admin.sidebar.collapsed` permanece en localStorage:
   es preferencia UI inocua (no contiene tokens), fuera del alcance
   defensivo de ADR-078.
   ═══════════════════════════════════════ */

const ADMIN_SIDEBAR_COLLAPSED_KEY = 'admin.sidebar.collapsed';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const openCmdPalette = useCallback(() => setCmdPaletteOpen(true), []);
  const closeCmdPalette = useCallback(() => setCmdPaletteOpen(false), []);

  /*
   * Hidratar la preferencia desde localStorage post-mount (evita
   * hydration mismatch porque el server no conoce la preferencia UI).
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación post-mount de preferencia UI (evita hydration mismatch — el server no conoce localStorage).
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(next));
      }
      return next;
    });
  }, []);

  /* Cerrar drawer móvil al cambiar de ruta. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mobile drawer sync con route change (sistema externo: Next.js router).
    setMobileMenuOpen(false);
  }, [pathname]);

  /* Cerrar drawer móvil al pasar a desktop por resize. */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* Atajo global Cmd+K / Ctrl+K (UI_SPEC §4.10). */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /*
   * Route-level permission check granular (CASL client-side). El SC
   * padre ya filtró por rol staff; aquí filtramos por AppModule
   * permission según la ruta actual. Defensa en profundidad sobre el
   * AdminOnlyGuard backend.
   */
  const roleSlug = user?.role?.slug || '';
  const hasRouteAccess = pathname === '/admin' || canAccessRoute(roleSlug, pathname);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width-admin)';

  return (
    <ToastProvider>
      {/* F3·E8 — heartbeat de presencia del staff (técnicos Support Inside). */}
      <PresenceHeartbeat />
      <div className={styles.shell}>
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onToggle={handleToggleSidebar}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        <Topbar
          sidebarWidth={sidebarWidth}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
          left={<span className={styles.pageTitle}>{getAdminTitle(pathname)}</span>}
          onOpenCommandPalette={openCmdPalette}
          actions={<TasksPill />}
        />

        <main className={styles.main} style={{ marginLeft: sidebarWidth }}>
          <div className={styles.content}>
            {hasRouteAccess ? children : <NoPermission />}
          </div>
        </main>
      </div>

      <CommandPalette open={cmdPaletteOpen} onClose={closeCmdPalette} />
    </ToastProvider>
  );
}

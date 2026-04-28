'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { canAccessRoute } from '../lib/permissions';
import NoPermission from '../components/ui/NoPermission';
import { ToastProvider, CommandPalette } from '../components/ui';
import dynamic from 'next/dynamic';
import Sidebar from './Sidebar';
// Sprint 9.6 Fase F.0: Topbar movido a _shared/shell/ — single source of
// truth entre Portal de Cliente y Portal de Administración (ADR-066).
import Topbar from '../_shared/shell/Topbar';
import styles from './layout.module.css';

const SupportPanel = dynamic(() => import('../components/SupportPanel'), { ssr: false });

/* ═══════════════════════════════════════
   Dashboard Layout — Shell orchestrator
   Composes Sidebar, Topbar, main content,
   and SupportPanel. Handles route-level PBAC.
   Ref: UI_SPEC.md §2.0, §3.9, ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportPanelOpen, setSupportPanelOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const { isLoading, user } = useAuth();
  const pathname = usePathname();

  const openCmdPalette = useCallback(() => setCmdPaletteOpen(true), []);
  const closeCmdPalette = useCallback(() => setCmdPaletteOpen(false), []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global Cmd+K / Ctrl+K shortcut (§4.10)
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

  if (isLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingInner}>
          <svg className={styles.spinner} viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className={styles.loadingText}>Cargando...</span>
        </div>
      </div>
    );
  }

  // Route-level permission check (5.0b)
  const roleSlug = user?.role?.slug || '';
  const hasRouteAccess = pathname === '/dashboard' || canAccessRoute(roleSlug, pathname);

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        <Topbar
          sidebarCollapsed={sidebarCollapsed}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
          onOpenSupportPanel={() => setSupportPanelOpen(true)}
          onOpenCommandPalette={openCmdPalette}
        />

        {/* Main content */}
        <main
          className={styles.main}
          style={{ marginLeft: sidebarCollapsed ? '72px' : '260px' }}
        >
          <div className={styles.content}>
            {hasRouteAccess ? children : <NoPermission />}
          </div>
        </main>

        {/* Support panel sidebar (clients only, §3.9) */}
        <SupportPanel
          isOpen={supportPanelOpen}
          onClose={() => setSupportPanelOpen(false)}
          sidebarCollapsed={sidebarCollapsed}
        />
      </div>

      {/* Command Palette (§4.10) */}
      <CommandPalette open={cmdPaletteOpen} onClose={closeCmdPalette} />
    </ToastProvider>
  );
}

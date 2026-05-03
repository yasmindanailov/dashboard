'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { canAccessRoute } from '../../lib/permissions';
import NoPermission from '../../components/ui/NoPermission';
import { ToastProvider, CommandPalette } from '../../components/ui';
import dynamic from 'next/dynamic';
import Sidebar from '../Sidebar';
import Topbar from '../../_shared/shell/Topbar';
import styles from '../layout.module.css';

const SupportPanel = dynamic(() => import('../../components/SupportPanel'), { ssr: false });

/* ═══════════════════════════════════════
   DashboardShell — CC con todo el estado UI del shell cliente/partner.
   Sprint 13 §13.AUTH Fase E (Modelo A): el SC padre
   `app/dashboard/layout.tsx` ya garantizó sesión válida.
   Aquí solo gestionamos: sidebar collapse, mobile drawer, command
   palette, support panel y route-level permission check granular.
   ═══════════════════════════════════════ */

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportPanelOpen, setSupportPanelOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  const openCmdPalette = useCallback(() => setCmdPaletteOpen(true), []);
  const closeCmdPalette = useCallback(() => setCmdPaletteOpen(false), []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

        <main
          className={styles.main}
          style={{ marginLeft: sidebarCollapsed ? '72px' : '260px' }}
        >
          <div className={styles.content}>
            {hasRouteAccess ? children : <NoPermission />}
          </div>
        </main>

        <SupportPanel
          isOpen={supportPanelOpen}
          onClose={() => setSupportPanelOpen(false)}
          sidebarCollapsed={sidebarCollapsed}
        />
      </div>

      <CommandPalette open={cmdPaletteOpen} onClose={closeCmdPalette} />
    </ToastProvider>
  );
}

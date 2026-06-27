'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

import { useAuth } from '../../lib/auth-context';
import { canAccessRoute } from '../../lib/permissions';
import NoPermission from '../../components/ui/NoPermission';
import { ToastProvider } from '../../components/ui';
import Sidebar from '../Sidebar';
import Topbar from '../../_shared/shell/Topbar';

import { Breadcrumbs } from './Breadcrumbs';
import { getClientCrumbs } from './breadcrumbs-map';
import styles from '../layout.module.css';

const SupportPanel = dynamic(() => import('../../components/SupportPanel'), { ssr: false });

/* ═══════════════════════════════════════
   DashboardShell — CC con el estado UI del shell cliente/partner.
   F2: topbar con migas (Breadcrumbs); el ⌘K/CommandPalette se retira del
   cliente (el mockup cliente no lo tiene); el soporte vive en la tarjeta del
   sidebar (CTA → SupportPanel). El SC padre `app/dashboard/layout.tsx` ya
   garantizó sesión válida (ADR-078 Modelo A).
   ═══════════════════════════════════════ */

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportPanelOpen, setSupportPanelOpen] = useState(false);
  const [supportInitialConvId, setSupportInitialConvId] = useState<string | null>(null);

  /* Abre el panel de soporte; con id → muestra esa conversación, sin id → el listado. */
  const openSupport = (conversationId?: string) => {
    setSupportInitialConvId(conversationId ?? null);
    setSupportPanelOpen(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mobile drawer sync con route change (sistema externo: Next.js router).
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const roleSlug = user?.role?.slug || '';
  const hasRouteAccess = pathname === '/dashboard' || canAccessRoute(roleSlug, pathname);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)';

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
          onOpenSupport={openSupport}
        />
        <Topbar
          sidebarWidth={sidebarWidth}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
          left={<Breadcrumbs items={getClientCrumbs(pathname)} />}
        />

        <main className={styles.main} style={{ marginLeft: sidebarWidth }}>
          <div className={styles.content}>{hasRouteAccess ? children : <NoPermission />}</div>
        </main>

        <SupportPanel
          isOpen={supportPanelOpen}
          onClose={() => setSupportPanelOpen(false)}
          sidebarCollapsed={sidebarCollapsed}
          initialConversationId={supportInitialConvId}
        />
      </div>
    </ToastProvider>
  );
}

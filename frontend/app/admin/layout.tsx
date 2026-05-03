'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { canAccessRoute } from '../lib/permissions';
import NoPermission from '../components/ui/NoPermission';
import { ToastProvider, CommandPalette } from '../components/ui';
import Topbar from '../_shared/shell/Topbar';
import AdminSidebar from './AdminSidebar';
import styles from './admin-layout.module.css';

/* Sprint 13.5 DC.14: persistencia del estado collapsed en localStorage
   (paridad con sidebar cliente). TODO(ADR-078, Sprint 13): cuando cierre
   §13.AUTH, mover esta preferencia UI a cookie httpOnly + SC nativo. */
const ADMIN_SIDEBAR_COLLAPSED_KEY = 'admin.sidebar.collapsed';

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

/* ═══════════════════════════════════════
   Admin Layout — Portal de Administración (`/admin/*`).
   Sprint 9 Fase F (DC.7) + Sprint 9.6 Fase F.0 (shell unificado).

   Estructura simétrica con `app/dashboard/layout.tsx`:
     ToastProvider
       └ shell
          ├ AdminSidebar  (estructura de operaciones del staff)
          ├ Topbar        (shared `_shared/shell/Topbar.tsx` — buscador
          │                Cmd+K, NotificationBell, dropdown perfil con
          │                "Mi perfil" / "Configuración" / "Cerrar sesión")
          └ main
       └ CommandPalette   (atajo Cmd+K / Ctrl+K global)

   Defense in depth:
     1. AdminOnlyGuard backend en /api/v1/admin/*  (rechazo en API).
     2. Este layout redirige a /dashboard si el usuario no es staff.
     3. canAccessRoute() filtra por SIDEBAR_PERMISSIONS y muestra
        <NoPermission /> si CASL del lado cliente lo deniega (UX
        coherente con dashboard/layout.tsx).

   Sprint 13.5 DC.14: AdminSidebar ahora soporta collapse desktop +
   drawer móvil con paridad de props sobre el Sidebar cliente. La
   preferencia `collapsed` persiste en localStorage durante la sesión;
   el drawer se cierra al navegar o al hacer click en el backdrop.
   ═══════════════════════════════════════ */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const openCmdPalette = useCallback(() => setCmdPaletteOpen(true), []);
  const closeCmdPalette = useCallback(() => setCmdPaletteOpen(false), []);

  /* Hidratar el estado collapse desde localStorage al montar (post-mount
     para evitar hydration mismatch). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY);
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

  /* Guard de redirección para usuarios no autenticados / no-staff. */
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Sprint 9.6 Fase F.0: la página de login real es `/` (raíz),
      // no `/login`. Si redirigía a `/login`, Next.js servía 404 y
      // el layout quedaba colgado en "Cargando…" sin navegar.
      router.replace('/?expired=true');
      return;
    }
    if (!STAFF_ROLES.has(user.role?.slug || '')) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  /* Atajo global Cmd+K / Ctrl+K (UI_SPEC §4.10). Mismo
     comportamiento que en `dashboard/layout.tsx` para que el muscle
     memory del staff funcione idéntico en ambos portales. */
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

  if (isLoading || !user || !STAFF_ROLES.has(user.role?.slug || '')) {
    return (
      <div className={styles.loading}>
        <span className={styles.loadingText}>Cargando…</span>
      </div>
    );
  }

  /* Route-level permission check (mismo patrón que dashboard).
     Las rutas /admin/* están en ROUTE_PERMISSIONS — si el rol staff
     no tiene el AppModule asociado, vemos <NoPermission/> en vez
     del contenido. Defensa adicional sobre AdminOnlyGuard backend. */
  const roleSlug = user.role?.slug || '';
  const hasRouteAccess = pathname === '/admin' || canAccessRoute(roleSlug, pathname);

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onToggle={handleToggleSidebar}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        {/* Topbar compartido con Portal de Cliente. El SupportButton
            interno se autorrestringe a `isClient` → en admin no se
            renderiza. `onOpenSupportPanel` es noop aquí (no hay panel
            de soporte cliente en admin). Sprint 13.5 DC.14: el botón
            menú móvil del Topbar ahora abre el drawer del AdminSidebar. */}
        <Topbar
          sidebarCollapsed={sidebarCollapsed}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
          onOpenSupportPanel={() => {}}
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
      </div>

      <CommandPalette open={cmdPaletteOpen} onClose={closeCmdPalette} />
    </ToastProvider>
  );
}

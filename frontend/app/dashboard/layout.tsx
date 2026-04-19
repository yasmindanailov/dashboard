'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { canAccess, canAccessRoute, type AppModule } from '../lib/permissions';
import NoPermission from '../components/ui/NoPermission';

/* ═══════════════════════════════════════
   Navigation items — role-filtered via requiredModule
   ═══════════════════════════════════════ */

interface NavItem {
  label: string;
  href: string;
  requiredModule: AppModule;
  icon: React.ReactNode;
  section?: 'main' | 'admin' | 'partner' | 'client';
}

const ICON = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
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
  services: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  commission: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  link: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
};

const ALL_NAV_ITEMS: NavItem[] = [
  // ── Main (all roles) ──
  { label: 'Dashboard', href: '/dashboard', requiredModule: 'Dashboard', icon: ICON.dashboard, section: 'main' },

  // ── Admin/Agent sections ──
  { label: 'Clientes', href: '/dashboard/clients', requiredModule: 'Client', icon: ICON.clients, section: 'admin' },
  { label: 'Productos', href: '/dashboard/products', requiredModule: 'Product', icon: ICON.products, section: 'admin' },
  { label: 'Facturación', href: '/dashboard/billing', requiredModule: 'Invoice', icon: ICON.billing, section: 'admin' },
  { label: 'Soporte', href: '/dashboard/support', requiredModule: 'Conversation', icon: ICON.support, section: 'admin' },
  { label: 'Tareas', href: '/dashboard/tasks', requiredModule: 'Task', icon: ICON.tasks, section: 'admin' },
  { label: 'Settings', href: '/dashboard/settings', requiredModule: 'Setting', icon: ICON.settings, section: 'admin' },

  // ── Client sections ──
  { label: 'Mis servicios', href: '/dashboard/services', requiredModule: 'Service', icon: ICON.services, section: 'client' },
  { label: 'Mis facturas', href: '/dashboard/billing', requiredModule: 'Invoice', icon: ICON.billing, section: 'client' },
  { label: 'Soporte', href: '/dashboard/support', requiredModule: 'Conversation', icon: ICON.support, section: 'client' },

  // ── Partner sections ──
  { label: 'Mis clientes', href: '/dashboard/my-clients', requiredModule: 'PartnerClient', icon: ICON.clients, section: 'partner' },
  { label: 'Comisiones', href: '/dashboard/commissions', requiredModule: 'PartnerCommission', icon: ICON.commission, section: 'partner' },
  { label: 'Mi enlace', href: '/dashboard/my-link', requiredModule: 'Partner', icon: ICON.link, section: 'partner' },
];

/**
 * Filter NAV_ITEMS based on user role and section context.
 */
function getNavItemsForRole(roleSlug: string): NavItem[] {
  // Determine which sections to show based on role type
  const isAdmin = ['superadmin', 'agent_full', 'agent_billing', 'agent_support'].includes(roleSlug);
  const isClient = roleSlug === 'client';
  const isPartner = ['partner', 'partner_pending'].includes(roleSlug);

  return ALL_NAV_ITEMS.filter((item) => {
    // Check module permission
    if (!canAccess(roleSlug, item.requiredModule)) return false;

    // Filter by section context to avoid duplicate items
    if (item.section === 'admin' && !isAdmin) return false;
    if (item.section === 'client' && !isClient) return false;
    if (item.section === 'partner' && !isPartner) return false;

    return true;
  });
}

/* ═══════════════════════════════════════
   Sidebar Component
   ═══════════════════════════════════════ */
function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const navItems = getNavItemsForRole(roleSlug);

  const sidebarContent = (
    <aside
      className="flex flex-col h-full"
      style={{ background: 'var(--surface-primary)' }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden" onClick={onMobileClose}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-semibold"
            style={{ background: 'var(--brand)' }}
          >
            A
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
              aelium
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href + item.section}
              href={item.href}
              onClick={onMobileClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                background: isActive ? 'var(--brand-light)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--surface-secondary)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="p-3 shrink-0 hidden md:block" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: 'var(--text-tertiary)' }}
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            className="transition-transform duration-300"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="fixed top-0 left-0 h-screen z-40 hidden md:flex flex-col transition-all duration-300 ease-in-out"
        style={{
          width: collapsed ? '72px' : '260px',
          borderRight: '1px solid var(--border)',
        }}
      >
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <div
            className="absolute top-0 left-0 h-full w-[280px] shadow-2xl transition-transform duration-300"
            style={{ transform: 'translateX(0)' }}
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════
   Topbar Component
   ═══════════════════════════════════════ */
function Topbar({
  sidebarCollapsed,
  onMobileMenuOpen,
}: {
  sidebarCollapsed: boolean;
  onMobileMenuOpen: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <header
      className="fixed top-0 right-0 h-16 flex items-center justify-between px-4 md:px-6 z-30 transition-all duration-300"
      style={{
        left: '0',
        background: 'var(--surface-primary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Desktop offset handled by CSS below */}
      <style>{`
        @media (min-width: 768px) {
          header { left: ${sidebarCollapsed ? '72px' : '260px'} !important; }
        }
      `}</style>
      {/* Left — Hamburger (mobile) */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="p-2 rounded-lg md:hidden cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          title="Abrir menú"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Right — User info + bell + logout */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Notification bell placeholder */}
        <button
          className="relative p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: 'var(--text-tertiary)' }}
          title="Notificaciones"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>

        {/* User info */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {user.first_name} {user.last_name}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {user.role?.name || user.role?.slug || ''}
              </div>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
              style={{ background: 'var(--brand)' }}
            >
              {user.first_name?.[0] || ''}{user.last_name?.[0] || ''}
            </div>
            <button
              onClick={logout}
              className="text-sm font-medium transition-colors duration-200 cursor-pointer hidden sm:block"
              style={{ color: 'var(--text-tertiary)' }}
              title="Cerrar sesión"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════
   Dashboard Layout
   ═══════════════════════════════════════ */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isLoading, user } = useAuth();
  const pathname = usePathname();

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-secondary)' }}>
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-6 w-6" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span style={{ color: 'var(--text-secondary)' }}>Cargando...</span>
        </div>
      </div>
    );
  }

  // Route-level permission check (5.0b)
  const roleSlug = user?.role?.slug || '';
  const hasRouteAccess = pathname === '/dashboard' || canAccessRoute(roleSlug, pathname);

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-secondary)' }}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <Topbar
        sidebarCollapsed={sidebarCollapsed}
        onMobileMenuOpen={() => setMobileMenuOpen(true)}
      />

      {/* Main content */}
      <main
        className="pt-16 transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? '72px' : '260px' }}
      >
        <div className="p-6 lg:p-8">
          {hasRouteAccess ? children : <NoPermission />}
        </div>
      </main>

      {/* Mobile: override marginLeft */}
      <style>{`
        @media (max-width: 767px) {
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}

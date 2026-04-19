'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

/* ═══════════════════════════════════════
   Navigation items
   ═══════════════════════════════════════ */
const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Clientes',
    href: '/dashboard/clients',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  // Future sprints:
  // { label: 'Productos', href: '/dashboard/products', icon: ... },
  // { label: 'Facturas', href: '/dashboard/billing', icon: ... },
  // { label: 'Soporte', href: '/dashboard/support', icon: ... },
  // { label: 'Tareas', href: '/dashboard/tasks', icon: ... },
];

/* ═══════════════════════════════════════
   Sidebar Component
   ═══════════════════════════════════════ */
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 h-screen z-40 flex flex-col transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? '72px' : '260px',
        background: 'var(--surface-primary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
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
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                background: isActive ? 'var(--brand-light)' : 'transparent',
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: 'var(--text-tertiary)' }}
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="transition-transform duration-300"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════
   Topbar Component
   ═══════════════════════════════════════ */
function Topbar({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const { user, logout } = useAuth();

  return (
    <header
      className="fixed top-0 right-0 h-16 flex items-center justify-between px-6 z-30 transition-all duration-300"
      style={{
        left: sidebarCollapsed ? '72px' : '260px',
        background: 'var(--surface-primary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left — Breadcrumb placeholder */}
      <div />

      {/* Right — User info + bell + logout */}
      <div className="flex items-center gap-4">
        {/* Notification bell placeholder (Sprint 4.8) */}
        <button
          className="relative p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: 'var(--text-tertiary)' }}
          title="Notificaciones"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {/* Badge — hidden until Sprint 9 */}
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
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════
   Dashboard Layout (wraps all /dashboard/* pages)
   ═══════════════════════════════════════ */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isLoading } = useAuth();

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-secondary)' }}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <Topbar sidebarCollapsed={sidebarCollapsed} />

      {/* Main content — offset by sidebar width and topbar height */}
      <main
        className="pt-16 transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? '72px' : '260px' }}
      >
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

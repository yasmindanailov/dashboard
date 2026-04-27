'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import styles from './admin-sidebar.module.css';

/* ═══════════════════════════════════════
   AdminSidebar — Sidebar exclusivo del árbol staff `/admin/*`.
   Ref: Sprint 9 Fase F + DC.7.

   Hoy contiene los 2 items que Fase F introduce. Sprint 9.6 (split
   retroactivo) migrará los items admin existentes (clients, tasks,
   settings, etc.) a este sidebar.
   ═══════════════════════════════════════ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Roles que pueden VER este item (subset de los roles staff). */
  allowedRoles?: string[];
}

const ICON = {
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
};

const ALL_ITEMS: NavItem[] = [
  {
    label: 'Error Log',
    href: '/admin/error-log',
    icon: ICON.errorLog,
    allowedRoles: ['superadmin'],
  },
  {
    label: 'Jobs en DLQ',
    href: '/admin/jobs/failed',
    icon: ICON.jobs,
    allowedRoles: ['superadmin'],
  },
  {
    label: 'Plantillas notificaciones',
    href: '/admin/notifications/templates',
    icon: ICON.templates,
    allowedRoles: ['superadmin'],
  },
];

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

function getItemsForRole(roleSlug: string): NavItem[] {
  if (!STAFF_ROLES.has(roleSlug)) return [];
  return ALL_ITEMS.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(roleSlug),
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const items = getItemsForRole(roleSlug);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Link href="/admin" className={styles.brandLink}>
          <span className={styles.brandMark}>A</span>
          <span className={styles.brandLabel}>Aelium · Staff</span>
        </Link>
      </div>

      <nav className={styles.nav}>
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Operaciones</span>
          <ul className={styles.list}>
            {items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.link} ${active ? styles.linkActive : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={styles.icon}>{item.icon}</span>
                    <span className={styles.label}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.section}>
          <Link href="/dashboard" className={styles.backLink}>
            ← Volver al panel cliente
          </Link>
        </div>
      </nav>
    </aside>
  );
}

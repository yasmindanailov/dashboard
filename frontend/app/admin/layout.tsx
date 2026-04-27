'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { ToastProvider } from '../components/ui';
import AdminSidebar from './AdminSidebar';
import styles from './admin-layout.module.css';

const STAFF_ROLES = new Set([
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
]);

/* ═══════════════════════════════════════
   Admin Layout — árbol staff `/admin/*` (Sprint 9 Fase F + DC.7).

   Doble guard (defense in depth):
    1. AdminOnlyGuard backend en /api/v1/admin/*  (rechazo en API).
    2. Este layout redirige a /dashboard si el usuario no es staff
       (UX: el cliente nunca ve la URL ni layout admin).
   ═══════════════════════════════════════ */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!STAFF_ROLES.has(user.role?.slug || '')) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || !STAFF_ROLES.has(user.role?.slug || '')) {
    return (
      <div className={styles.loading}>
        <span className={styles.loadingText}>Cargando…</span>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <AdminSidebar />
        <main className={styles.main}>
          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}

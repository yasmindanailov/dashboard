'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import {
  dashboardApi,
  type OverviewStats,
} from '../lib/api';
import { Card, Skeleton, EmptyState } from '../components/ui';
import { AdminStats, ClientStats, AgentStats, PartnerStats } from './overview/StatsGrids';
import { buildAlerts, AlertList, getQuickActions } from './overview/Sections';
import styles from './overview.module.css';

/* ═══════════════════════════════════════
   Dashboard Overview Page
   Layout: 1200px wrapper (§2.8)
   Anatomy: Greeting → Stats → Sections (§2.3)
   Role-aware: each role sees different stats
   per UI_SPEC.md §2.3 table.

   Refactored per Regla 15:
   - Icons → overview/icons.tsx
   - Stats grids → overview/StatsGrids.tsx
   - Alerts + Quick Actions → overview/Sections.tsx
   ═══════════════════════════════════════ */

const ADMIN_ROLES = ['superadmin', 'agent_full'];
const AGENT_ROLES = ['agent_billing', 'agent_support'];

/* ── Contextual greeting per §2.3 ── */
function getGreeting(name: string, roleSlug: string): { title: string; subtitle: string } {
  const hour = new Date().getHours();
  let period = 'Buenos días';
  if (hour >= 14 && hour < 21) period = 'Buenas tardes';
  else if (hour >= 21 || hour < 6) period = 'Buenas noches';

  // §2.3: "¿Todo va bien?" (cliente) / "¿Qué tengo pendiente?" (agente/admin)
  let subtitle = 'Aquí tienes el resumen de tu plataforma.';
  if (roleSlug === 'client') {
    subtitle = 'Aquí tienes el estado de tus servicios.';
  } else if (AGENT_ROLES.includes(roleSlug)) {
    subtitle = '¿Qué tienes pendiente hoy?';
  } else if (roleSlug === 'partner' || roleSlug === 'partner_pending') {
    subtitle = 'Resumen de tu programa de referidos.';
  }

  return { title: `${period}, ${name}`, subtitle };
}

/* ═══════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════ */

export default function DashboardPage() {
  const { user } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [alerts, setAlerts] = useState<ReturnType<typeof buildAlerts>>([]);

  const loadOverviewData = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const overview = await dashboardApi.getOverview(token);
      setStats(overview);
      setAlerts(buildAlerts(overview));
    } catch (err) {
      console.warn('[Overview] loadOverviewData failed:', err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  if (!user) return null;

  const roleSlug = user.role?.slug || 'client';
  const greeting = getGreeting(user.first_name, roleSlug);
  const quickActions = getQuickActions(roleSlug);

  return (
    <div className={styles.container}>
      {/* ── Greeting header (§2.3) ── */}
      <div className={styles.greeting}>
        <h1 className={styles.greetingTitle}>{greeting.title}</h1>
        <p className={styles.greetingSubtitle}>{greeting.subtitle}</p>
      </div>

      {/* ── Stats grid — role-aware (§2.3 table) ── */}
      {loading ? (
        <div className={styles.statsSkeleton}>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className={styles.skeletonCard}>
                <Skeleton width="50%" height={12} />
                <div className={styles.skeletonGap12}><Skeleton width="70%" height={24} /></div>
                <div className={styles.skeletonGap8}><Skeleton width="40%" height={10} /></div>
              </div>
            </Card>
          ))}
        </div>
      ) : stats && (
        <>
          {stats.role === 'admin' && <AdminStats stats={stats} />}
          {stats.role === 'client' && <ClientStats stats={stats} />}
          {stats.role === 'agent' && <AgentStats stats={stats} />}
          {stats.role === 'partner' && <PartnerStats stats={stats} />}
        </>
      )}

      {/* ── Content sections (§2.3: máx 2-3) ── */}
      <div className={styles.sections}>
        {/* Section A: Alerts / News (P6.1, P6.2) */}
        <Card>
          <div className={styles.sectionBody}>
            <h2 className={styles.sectionTitle}>
              {roleSlug === 'client' || roleSlug === 'partner' || roleSlug === 'partner_pending'
                ? 'Novedades' : 'Alertas'}
            </h2>
            {loading ? (
              <div>
                {[1, 2].map((i) => (
                  <div key={i} className={styles.alertRow}>
                    <div className={styles.alertRowLeft}>
                      <Skeleton width={32} height={32} />
                      <div>
                        <Skeleton width={200} height={14} />
                        <div className={styles.skeletonGap4}><Skeleton width={120} height={10} /></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <EmptyState
                title="Todo en orden"
                description={
                  roleSlug === 'client'
                    ? 'No tienes novedades pendientes. Todo va bien.'
                    : roleSlug === 'partner' || roleSlug === 'partner_pending'
                    ? 'Sin novedades — tu programa de referidos está activo.'
                    : 'Sin alertas activas. Buen trabajo.'
                }
                icon={
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIconSuccess}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                }
              />
            ) : (
              <AlertList alerts={alerts} />
            )}
          </div>
        </Card>

        {/* Section B: Quick actions */}
        <Card>
          <div className={styles.sectionBody}>
            <h2 className={styles.sectionTitle}>Accesos rápidos</h2>
            <div className={styles.quickActions}>
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href} className={styles.quickAction}>
                  <div className={styles.quickActionIcon}>{action.icon}</div>
                  <div>
                    <div className={styles.quickActionText}>{action.title}</div>
                    <div className={styles.quickActionDesc}>{action.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

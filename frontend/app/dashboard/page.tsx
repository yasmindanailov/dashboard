/**
 * Dashboard Overview — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. El layout (SC) garantiza sesión; aquí
 * fetcheamos overview + alerts + quick actions server-side y
 * renderizamos sin loading flash. Los componentes overview/* son
 * SC también, así que cero `'use client'` aquí. ADR-078 Amendment A1.
 */

import Link from 'next/link';
import {
  serverFetch,
  ServerFetchError,
  requireServerSession,
} from '../lib/server-auth';
import { Card, EmptyState } from '../components/ui';
import {
  AdminStats,
  AgentStats,
  ClientStats,
  PartnerStats,
} from './overview/StatsGrids';
import { AlertList, buildAlerts, getQuickActions } from './overview/Sections';
import type { OverviewStats } from '../lib/api';
import styles from './overview.module.css';

const AGENT_ROLES = ['agent_billing', 'agent_support'];

function getGreeting(name: string, roleSlug: string): { title: string; subtitle: string } {
  const hour = new Date().getHours();
  let period = 'Buenos días';
  if (hour >= 14 && hour < 21) period = 'Buenas tardes';
  else if (hour >= 21 || hour < 6) period = 'Buenas noches';

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

export default async function DashboardPage() {
  const session = await requireServerSession();
  const user = session.user;

  let stats: OverviewStats | null = null;
  try {
    stats = await serverFetch<OverviewStats>('/dashboard/overview');
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
    /* Errores de red no rompen la página; las stats simplemente no aparecen. */
  }

  const roleSlug = user.role?.slug || 'client';
  const greeting = getGreeting(user.first_name, roleSlug);
  const quickActions = getQuickActions(roleSlug);
  const alerts = stats ? buildAlerts(stats) : [];

  return (
    <div className={styles.container}>
      <div className={styles.greeting}>
        <h1 className={styles.greetingTitle}>{greeting.title}</h1>
        <p className={styles.greetingSubtitle}>{greeting.subtitle}</p>
      </div>

      {stats && (
        <>
          {stats.role === 'admin' && <AdminStats stats={stats} />}
          {stats.role === 'client' && <ClientStats stats={stats} />}
          {stats.role === 'agent' && <AgentStats stats={stats} />}
          {stats.role === 'partner' && <PartnerStats stats={stats} />}
        </>
      )}

      <div className={styles.sections}>
        <Card>
          <div className={styles.sectionBody}>
            <h2 className={styles.sectionTitle}>
              {roleSlug === 'client' || roleSlug === 'partner' || roleSlug === 'partner_pending'
                ? 'Novedades'
                : 'Alertas'}
            </h2>
            {alerts.length === 0 ? (
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
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.emptyIconSuccess}
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                }
              />
            ) : (
              <AlertList alerts={alerts} />
            )}
          </div>
        </Card>

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

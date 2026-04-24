'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import {
  dashboardApi,
  type OverviewStats,
  type AdminOverview,
  type ClientOverview,
  type AgentOverview,
  type PartnerOverview,
} from '../lib/api';
import { StatsCard, Card, Skeleton, EmptyState, Badge, HelpTip } from '../components/ui';
import styles from './overview.module.css';

/* ═══════════════════════════════════════
   Dashboard Overview Page
   Layout: 1200px wrapper (§2.8)
   Anatomy: Greeting → Stats → Sections (§2.3)
   Role-aware: each role sees different stats
   per UI_SPEC.md §2.3 table.
   ═══════════════════════════════════════ */

const ADMIN_ROLES = ['superadmin', 'agent_full'];
const AGENT_ROLES = ['agent_billing', 'agent_support'];

interface Alert {
  id: string;
  title: string;
  meta: string;
  type: 'warning' | 'danger' | 'info';
  href: string;
}

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

/* ── Icon SVGs ── */
const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const InvoiceIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);
const TicketIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ProductIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const TaskIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);
const EuroIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="7" y1="10" x2="14" y2="10" />
    <line x1="7" y1="14" x2="14" y2="14" /><path d="M15 6a5 5 0 0 0-4 8.5A5 5 0 0 0 15 18" />
  </svg>
);

const AlertIcons: Record<string, () => React.ReactNode> = {
  warning: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
  danger: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
  ),
  info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
  ),
};

/* ── Format helpers ── */
function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ═══════════════════════════════════════
   Stats Grid Components — one per role
   ═══════════════════════════════════════ */

function AdminStats({ stats }: { stats: AdminOverview }) {
  return (
    <div className={styles.statsGrid}>
      <StatsCard label="Clientes activos" value={stats.active_clients} icon={<UsersIcon />} accentColor="var(--brand)" />
      <StatsCard label="Ingresos totales" value={formatCurrency(stats.total_revenue)} icon={<EuroIcon />} accentColor="var(--success)" />
      <StatsCard label="Facturas vencidas" value={stats.overdue_invoices} icon={<InvoiceIcon />} accentColor={stats.overdue_invoices > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
      <StatsCard label="Tickets abiertos" value={stats.open_tickets} icon={<TicketIcon />} accentColor={stats.open_tickets > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
    </div>
  );
}

function ClientStats({ stats }: { stats: ClientOverview }) {
  return (
    <div className={styles.statsGrid}>
      <StatsCard label="Servicios activos" value={stats.active_services} icon={<ProductIcon />} accentColor="var(--brand)" />
      <StatsCard label={<>Factura pendiente <HelpTip text="Importe total de las facturas que aún no se han cobrado. Se cobrarán automáticamente en la fecha de vencimiento." /></>} value={formatCurrency(stats.pending_invoice_amount)} icon={<InvoiceIcon />} accentColor={stats.pending_invoice_amount > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
      <StatsCard label={<>Próxima renovación <HelpTip text="Fecha en la que se renueva automáticamente tu servicio más próximo. Se genera una factura unos días antes." /></>} value={formatDate(stats.next_renewal)} icon={<CalendarIcon />} accentColor="var(--info)" subtext={stats.next_renewal ? undefined : 'Sin servicios activos'} />
      <StatsCard label="Tickets abiertos" value={stats.open_tickets} icon={<TicketIcon />} accentColor={stats.open_tickets > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
    </div>
  );
}

function AgentStats({ stats }: { stats: AgentOverview }) {
  return (
    <div className={styles.statsGridThree}>
      <StatsCard label="Chats esperando" value={stats.waiting_chats} icon={<ChatIcon />} accentColor={stats.waiting_chats > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
      <StatsCard label="Tickets sin responder" value={stats.unanswered_tickets} icon={<TicketIcon />} accentColor={stats.unanswered_tickets > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
      <StatsCard label="Tareas hoy" value={stats.tasks_today} icon={<TaskIcon />} accentColor={stats.tasks_today > 0 ? 'var(--brand)' : 'var(--text-tertiary)'} />
    </div>
  );
}

function PartnerStats({ stats }: { stats: PartnerOverview }) {
  return (
    <div className={styles.statsGridThree}>
      <StatsCard label="Clientes referidos" value={stats.referred_clients} icon={<UsersIcon />} accentColor="var(--brand)" />
      <StatsCard label="Comisiones del mes" value={formatCurrency(stats.commissions_this_month)} icon={<EuroIcon />} accentColor="var(--success)" />
      <StatsCard label="Próxima liquidación" value={formatDate(stats.next_settlement)} icon={<CalendarIcon />} accentColor="var(--info)" subtext={stats.next_settlement ? undefined : 'Pendiente de programar'} />
    </div>
  );
}

/* ═══════════════════════════════════════
   Alert builder — role-aware
   ═══════════════════════════════════════ */

function buildAlerts(stats: OverviewStats): Alert[] {
  const alerts: Alert[] = [];

  if (stats.role === 'admin') {
    if (stats.overdue_invoices > 0) {
      alerts.push({
        id: 'overdue',
        title: `${stats.overdue_invoices} factura${stats.overdue_invoices > 1 ? 's' : ''} vencida${stats.overdue_invoices > 1 ? 's' : ''}`,
        meta: 'Requiere atención inmediata',
        type: 'danger',
        href: '/dashboard/billing?status=overdue',
      });
    }
    if (stats.waiting_agent > 0) {
      alerts.push({
        id: 'waiting',
        title: `${stats.waiting_agent} chat${stats.waiting_agent > 1 ? 's' : ''} esperando respuesta`,
        meta: 'Clientes en cola',
        type: 'warning',
        href: '/dashboard/support/chats',
      });
    }
    if (stats.open_tickets > 0) {
      alerts.push({
        id: 'tickets',
        title: `${stats.open_tickets} ticket${stats.open_tickets > 1 ? 's' : ''} abierto${stats.open_tickets > 1 ? 's' : ''}`,
        meta: 'Pendientes de resolución',
        type: 'info',
        href: '/dashboard/support',
      });
    }
  }

  if (stats.role === 'client') {
    if (stats.pending_invoice_amount > 0) {
      alerts.push({
        id: 'pending',
        title: `Factura pendiente: ${formatCurrency(stats.pending_invoice_amount)}`,
        meta: 'Revisa tus facturas',
        type: 'warning',
        href: '/dashboard/billing',
      });
    }
    if (stats.open_tickets > 0) {
      alerts.push({
        id: 'tickets',
        title: `${stats.open_tickets} ticket${stats.open_tickets > 1 ? 's' : ''} en curso`,
        meta: 'Hay actualizaciones',
        type: 'info',
        href: '/dashboard/support',
      });
    }
  }

  if (stats.role === 'agent') {
    if (stats.waiting_chats > 0) {
      alerts.push({
        id: 'chats',
        title: `${stats.waiting_chats} chat${stats.waiting_chats > 1 ? 's' : ''} esperando tu respuesta`,
        meta: 'Clientes activos en cola',
        type: 'danger',
        href: '/dashboard/support/chats',
      });
    }
    if (stats.unanswered_tickets > 0) {
      alerts.push({
        id: 'tickets',
        title: `${stats.unanswered_tickets} ticket${stats.unanswered_tickets > 1 ? 's' : ''} sin primera respuesta`,
        meta: 'Afecta al SLA',
        type: 'warning',
        href: '/dashboard/support',
      });
    }
  }

  return alerts;
}

/* ═══════════════════════════════════════
   Quick actions — role-aware
   ═══════════════════════════════════════ */

interface QuickAction {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

function getQuickActions(roleSlug: string): QuickAction[] {
  const isAdmin = ADMIN_ROLES.includes(roleSlug);
  const isAgent = AGENT_ROLES.includes(roleSlug);

  if (roleSlug === 'client') {
    return [
      { href: '/dashboard/billing', icon: <InvoiceIcon />, title: 'Mis facturas', desc: 'Ver facturas y pagos' },
      { href: '/dashboard/support', icon: <TicketIcon />, title: 'Soporte', desc: 'Abrir o seguir un ticket' },
      { href: '/dashboard/billing/checkout', icon: <ProductIcon />, title: 'Contratar', desc: 'Explorar servicios' },
    ];
  }

  if (roleSlug === 'partner' || roleSlug === 'partner_pending') {
    return [
      { href: '/dashboard/clients', icon: <UsersIcon />, title: 'Mis referidos', desc: 'Clientes referidos' },
      { href: '/dashboard/billing', icon: <InvoiceIcon />, title: 'Comisiones', desc: 'Historial de comisiones' },
    ];
  }

  if (isAgent) {
    return [
      { href: '/dashboard/support/chats', icon: <ChatIcon />, title: 'Chats en vivo', desc: 'Panel de agente' },
      { href: '/dashboard/support', icon: <TicketIcon />, title: 'Tickets', desc: 'Gestionar tickets' },
      { href: '/dashboard/clients', icon: <UsersIcon />, title: 'Clientes', desc: 'Buscar clientes' },
    ];
  }

  // Admin
  return [
    { href: '/dashboard/clients', icon: <UsersIcon />, title: 'Clientes', desc: 'Gestionar clientes' },
    { href: '/dashboard/billing', icon: <InvoiceIcon />, title: 'Facturación', desc: 'Ver facturas' },
    { href: '/dashboard/products', icon: <ProductIcon />, title: 'Productos', desc: 'Catálogo de servicios' },
    { href: '/dashboard/support', icon: <TicketIcon />, title: 'Soporte', desc: 'Tickets y chats' },
    { href: '/dashboard/support/chats', icon: <ChatIcon />, title: 'Chats en vivo', desc: 'Panel de agente' },
  ];
}

/* ═══════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════ */

export default function DashboardPage() {
  const { user } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const loadOverviewData = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const overview = await dashboardApi.getOverview(token);
      setStats(overview);
      setAlerts(buildAlerts(overview));
    } catch {
      // Graceful degradation — show empty state
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
              alerts.map((alert) => {
                const IconComponent = AlertIcons[alert.type];
                const iconClass = alert.type === 'danger' ? styles.alertIconDanger
                  : alert.type === 'warning' ? styles.alertIconWarning
                  : styles.alertIconInfo;

                return (
                  <Link key={alert.id} href={alert.href} className={styles.alertLink}>
                    <div className={styles.alertRow}>
                      <div className={styles.alertRowLeft}>
                        <div className={`${styles.alertIcon} ${iconClass}`}>
                          <IconComponent />
                        </div>
                        <div>
                          <div className={styles.alertTitle}>{alert.title}</div>
                          <div className={styles.alertMeta}>{alert.meta}</div>
                        </div>
                      </div>
                      <Badge variant={alert.type === 'danger' ? 'danger' : alert.type === 'warning' ? 'warning' : 'info'}>
                        {alert.type === 'danger' ? 'Urgente' : alert.type === 'warning' ? 'Pendiente' : 'Info'}
                      </Badge>
                    </div>
                  </Link>
                );
              })
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

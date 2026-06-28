import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import {
  Euro,
  Users,
  Receipt,
  ShieldCheck,
  Bug,
  Server,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

import { IconWell, Avatar, StatusDot, EmptyState } from '../../components/ui';
import type { IconWellTone } from '../../components/ui';
import type {
  AdminOverviewKpis,
  DecisionSignal,
  TeamLoad,
} from '../../lib/api/dashboard';
import s from './executive-dashboard.module.css';

/* ═══════════════════════════════════════
   ExecutiveDashboard — landing /admin (F3·E7), 1:1 con admin/Inicio.dc.html.
   Server Component presentacional (sin hooks): navega con <Link>, reusa las
   primitivas del DS (IconWell/Avatar/StatusDot). Los datos llegan ya agregados
   de los 3 endpoints /admin/overview*. Pinta solo lo que recibe (degrada si un
   bloque viene null).
   ═══════════════════════════════════════ */

export interface ExecutiveDashboardProps {
  firstName: string;
  kpis: AdminOverviewKpis | null;
  decisions: DecisionSignal[] | null;
  teamLoad: TeamLoad | null;
}

// ── Helpers de formato ──

const eur = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
function formatEur(n: number): string {
  return `${eur.format(Math.round(n))} €`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

function greetingTitle(firstName: string): string {
  const hour = new Date().getHours();
  let period = 'Buenos días';
  if (hour >= 14 && hour < 21) period = 'Buenas tardes';
  else if (hour >= 21 || hour < 6) period = 'Buenas noches';
  return `${period}, ${firstName}`;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Admin',
  agent_full: 'Full',
  agent_support: 'Soporte',
  agent_billing: 'Facturación',
};

// ── Mapeo de cada señal del feed a su presentación ──

interface DecisionView {
  icon: LucideIcon;
  tone: IconWellTone;
  title: string;
  detail: string;
  action: string;
  href: string;
}

function decisionView(signal: DecisionSignal): DecisionView {
  const { kind, count } = signal;
  switch (kind) {
    case 'overdue_invoices': {
      const amount =
        signal.amount !== undefined ? ` · ${formatEur(signal.amount)}` : '';
      const detail =
        signal.oldest_days !== undefined
          ? `La más antigua lleva ${signal.oldest_days} ${plural(signal.oldest_days, 'día', 'días')} vencida · decide si reclamar, prorrogar o cancelar`
          : 'Decide si reclamar, dar prórroga o cancelar el servicio';
      return {
        icon: Receipt,
        tone: 'danger',
        title: `${count} ${plural(count, 'factura vencida', 'facturas vencidas')}${amount}`,
        detail,
        action: 'Revisar',
        href: '/admin/billing',
      };
    }
    case 'errors_5xx':
      return {
        icon: Bug,
        tone: 'danger',
        title: `${count} ${plural(count, 'error 5xx', 'errores 5xx')} en la última hora`,
        detail: 'Errores del servidor por encima de lo normal · revisa el Error Log',
        action: 'Ver log',
        href: '/admin/error-log',
      };
    case 'dlq_jobs':
      return {
        icon: Server,
        tone: 'warning',
        title: `${count} ${plural(count, 'job', 'jobs')} en la cola muerta (DLQ)`,
        detail: signal.sample
          ? `${signal.sample} agotó sus reintentos · reintenta o descarta`
          : 'Jobs que agotaron sus reintentos · reintenta o descarta',
        action: 'Reintentar',
        href: '/admin/jobs/failed',
      };
    case 'si_maintenance':
      return {
        icon: ShieldCheck,
        tone: 'warning',
        title: `${count} ${plural(count, 'servicio', 'servicios')} SI sin mantenimiento >60 días`,
        detail: 'La promesa de Support Inside en riesgo de incumplir',
        action: 'Asignar',
        href: '/admin/services',
      };
  }
}

// ── Saturación de la carga del equipo → tono de la barra ──
function saturationTone(pct: number): 'high' | 'mid' | 'low' {
  if (pct >= 0.8) return 'high';
  if (pct >= 0.4) return 'mid';
  return 'low';
}

export function ExecutiveDashboard({
  firstName,
  kpis,
  decisions,
  teamLoad,
}: ExecutiveDashboardProps) {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(now);
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(now);
  const eyebrow = `${capitalize(weekday)} · ${now.getDate()} ${month}`;
  const prevMonth = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
  );

  const signals = decisions ?? [];
  const members = teamLoad?.members ?? [];
  const maxOpen = teamLoad?.max_open ?? 0;
  const topMember = members[0];
  const showOverloadWarning = !!topMember && maxOpen >= 8;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.eyebrow}>{eyebrow}</div>
        <h1 className={s.title}>{greetingTitle(firstName)}</h1>
        <p className={s.subtitle}>
          El pulso de Aelium hoy — y lo que necesita tu decisión.
        </p>
      </header>

      {kpis && (
        <div className={s.kpiRow}>
          {/* Ingresos del mes */}
          <KpiCard
            href="/admin/billing"
            icon={Euro}
            tone="success"
            label="Ingresos del mes"
            value={formatEur(kpis.revenue_this_month)}
          >
            {kpis.revenue_mom_pct === null ? (
              <span className={s.kpiSubMuted}>Primer mes con datos</span>
            ) : (
              <span
                className={`${s.kpiDelta} ${kpis.revenue_mom_pct >= 0 ? s.deltaUp : s.deltaDown}`}
              >
                {kpis.revenue_mom_pct >= 0 ? (
                  <ArrowUp size={13} strokeWidth={1.8} />
                ) : (
                  <ArrowDown size={13} strokeWidth={1.8} />
                )}
                {kpis.revenue_mom_pct >= 0 ? '+' : ''}
                {kpis.revenue_mom_pct}% vs. {prevMonth}
              </span>
            )}
          </KpiCard>

          {/* Clientes activos */}
          <KpiCard
            href="/admin/clients"
            icon={Users}
            tone="brand"
            label="Clientes activos"
            value={String(kpis.active_clients)}
          >
            {kpis.new_clients_this_month > 0 ? (
              <span className={`${s.kpiDelta} ${s.deltaUp}`}>
                <ArrowUp size={13} strokeWidth={1.8} />+{kpis.new_clients_this_month}{' '}
                {plural(kpis.new_clients_this_month, 'nuevo', 'nuevos')} este mes
              </span>
            ) : (
              <span className={s.kpiSubMuted}>Sin altas este mes</span>
            )}
          </KpiCard>

          {/* Por cobrar vencido */}
          <KpiCard
            href="/admin/billing"
            icon={Receipt}
            tone={kpis.overdue_count > 0 ? 'danger' : 'success'}
            label="Por cobrar vencido"
            value={formatEur(kpis.overdue_amount)}
          >
            {kpis.overdue_count > 0 ? (
              <span className={s.kpiSubDanger}>
                {kpis.overdue_count}{' '}
                {plural(kpis.overdue_count, 'factura', 'facturas')}
                {kpis.oldest_overdue_days !== null
                  ? ` · la + antigua, ${kpis.oldest_overdue_days} ${plural(kpis.oldest_overdue_days, 'día', 'días')}`
                  : ''}
              </span>
            ) : (
              <span className={s.kpiSubMuted}>Sin facturas vencidas</span>
            )}
          </KpiCard>

          {/* SLA de soporte */}
          <KpiCard
            href="/admin/support"
            icon={ShieldCheck}
            tone="success"
            label="SLA de soporte"
            value={
              kpis.sla_compliance_pct === null ? (
                '—'
              ) : (
                <>
                  {kpis.sla_compliance_pct}%{' '}
                  <span className={s.kpiValueUnit}>cumplido</span>
                </>
              )
            }
          >
            {kpis.sla_compliance_pct === null ? (
              <span className={s.kpiSubMuted}>Sin tickets en 30 días</span>
            ) : (
              <>
                <Bar pct={kpis.sla_compliance_pct / 100} tone="sla" />
                <span
                  className={
                    kpis.sla_breaches > 0 ? s.kpiSubWarn : s.kpiSubMuted
                  }
                >
                  {kpis.sla_breaches > 0
                    ? `${kpis.sla_breaches} ${plural(kpis.sla_breaches, 'respuesta fuera de plazo', 'respuestas fuera de plazo')}`
                    : 'Todas dentro de plazo'}
                </span>
              </>
            )}
          </KpiCard>
        </div>
      )}

      <div className={s.grid}>
        {/* Requiere tu decisión */}
        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.cardHeadTitle}>
              <h2 className={s.cardTitle}>Requiere tu decisión</h2>
              {signals.length > 0 && (
                <span className={s.countBadge}>{signals.length}</span>
              )}
            </div>
            <p className={s.cardSub}>
              Señales del sistema que un agente no resuelve solo
            </p>
          </div>

          {signals.length === 0 ? (
            <EmptyState
              title="Todo en orden"
              description="No hay señales que requieran tu decisión ahora mismo."
            />
          ) : (
            <div className={s.feed}>
              {signals.map((signal) => {
                const v = decisionView(signal);
                return (
                  <Link key={signal.kind} href={v.href} className={s.decisionRow}>
                    <IconWell icon={v.icon} tone={v.tone} size="md" />
                    <span className={s.decisionBody}>
                      <span className={s.decisionTitle}>{v.title}</span>
                      <span className={s.decisionDetail}>{v.detail}</span>
                    </span>
                    <span className={s.decisionAction}>
                      {v.action}
                      <ChevronRight size={16} strokeWidth={1.8} className={s.chevron} />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Carga del equipo */}
        <aside className={s.card}>
          <h2 className={s.cardTitle}>Carga del equipo</h2>
          <p className={s.cardSub}>Reparto del trabajo de soporte</p>

          {members.length === 0 ? (
            <EmptyState
              title="Sin equipo de soporte"
              description="No hay agentes activos para repartir el trabajo."
            />
          ) : (
            <>
              <div className={s.team}>
                {members.map((m) => {
                  const pct = maxOpen > 0 ? m.open_count / maxOpen : 0;
                  return (
                    <div key={m.user_id} className={s.teamRow}>
                      <span className={s.teamAvatar}>
                        <Avatar name={m.name} size="sm" />
                        <span className={s.presence}>
                          <StatusDot color={m.online ? 'success' : 'neutral'} />
                        </span>
                      </span>
                      <span className={s.teamBody}>
                        <span className={s.teamLine}>
                          <span className={s.teamName}>
                            {m.name}
                            <span className={s.teamRole}>
                              {' '}
                              · {ROLE_LABELS[m.role_slug] ?? m.role_slug}
                            </span>
                          </span>
                          <span
                            className={`${s.teamCount} ${s[`count_${saturationTone(pct)}`]}`}
                          >
                            {m.open_count}{' '}
                            {plural(m.open_count, 'abierta', 'abiertas')}
                          </span>
                        </span>
                        <Bar pct={pct} tone={saturationTone(pct)} />
                      </span>
                    </div>
                  );
                })}
              </div>

              {showOverloadWarning && (
                <div className={s.warnCallout}>
                  <AlertTriangle size={16} strokeWidth={1.7} className={s.warnIcon} />
                  <span>
                    {topMember.name.split(' ')[0]} está al límite. Reparte antes de
                    que afecte al SLA.
                  </span>
                </div>
              )}

              <Link href="/admin/tasks" className={s.reassignBtn}>
                Reasignar tareas del equipo
              </Link>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Sub-componentes locales ──

function KpiCard({
  href,
  icon,
  tone,
  label,
  value,
  children,
}: {
  href: string;
  icon: LucideIcon;
  tone: IconWellTone;
  label: string;
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={s.kpiCard}>
      <div className={s.kpiHead}>
        <span className={s.kpiLabel}>{label}</span>
        <IconWell icon={icon} tone={tone} size="md" />
      </div>
      <div className={s.kpiValue}>{value}</div>
      {children}
    </Link>
  );
}

function Bar({
  pct,
  tone,
}: {
  pct: number;
  tone: 'sla' | 'high' | 'mid' | 'low';
}) {
  const width = `${Math.min(Math.max(pct, 0), 1) * 100}%`;
  return (
    <span className={s.barTrack}>
      <span
        className={`${s.barFill} ${s[`bar_${tone}`]}`}
        style={{ '--bar-w': width } as CSSProperties}
        aria-hidden="true"
      />
    </span>
  );
}

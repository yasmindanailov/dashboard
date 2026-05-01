import React from 'react';
import Link from 'next/link';
import { StatsCard, HelpTip } from '../../components/ui';
import {
  UsersIcon, InvoiceIcon, TicketIcon, ChatIcon,
  ProductIcon, CalendarIcon, TaskIcon, EuroIcon,
} from './icons';
import type {
  AdminOverview, ClientOverview, AgentOverview, PartnerOverview,
} from '../../lib/api';
import styles from '../overview.module.css';

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M12 2l9 4v6c0 5-3.6 9.3-9 10-5.4-.7-9-5-9-10V6l9-4z" />
    <path d="M12 11v4" />
    <path d="M12 8h.01" />
  </svg>
);

/* ═══════════════════════════════════════
   Stats Grid Components — one per role
   Extracted from overview page per Regla 15.
   Ref: UI_SPEC.md §2.3 stats-per-role table.
   ═══════════════════════════════════════ */

/* ── Format helpers ── */
function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminStats({ stats }: { stats: AdminOverview }) {
  return (
    <div className={styles.statsGrid}>
      <StatsCard label="Clientes activos" value={stats.active_clients} icon={<UsersIcon />} accentColor="var(--brand)" />
      <StatsCard label="Ingresos totales" value={formatCurrency(stats.total_revenue)} icon={<EuroIcon />} accentColor="var(--success)" />
      <StatsCard label="Facturas vencidas" value={stats.overdue_invoices} icon={<InvoiceIcon />} accentColor={stats.overdue_invoices > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
      <StatsCard label="Tickets abiertos" value={stats.open_tickets} icon={<TicketIcon />} accentColor={stats.open_tickets > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
      <StatsCard label="Chats activos" value={stats.open_chats} icon={<ChatIcon />} accentColor={stats.open_chats > 0 ? 'var(--info)' : 'var(--text-tertiary)'} />
    </div>
  );
}

export function ClientStats({ stats }: { stats: ClientOverview }) {
  // Sub-fase 8.D.12.7 — card Support Inside como tier de cuenta visible.
  // Si tiene plan activo: muestra "{nombre} · slots N/M" + SLA.
  // Si no: CTA "Activa Support Inside" → /dashboard/support-inside.
  const si = stats.support_inside;
  const siValue = si ? si.product_name : 'Sin plan';
  const siSubtext = si
    ? `${si.slots_used}/${si.slots_included} slot${si.slots_included !== 1 ? 's' : ''} · SLA ${si.response_sla_hours}h`
    : 'Activa para soporte humano y mantenimientos';
  const siAccent = si ? 'var(--brand)' : 'var(--text-tertiary)';

  return (
    <div className={styles.statsGrid}>
      <StatsCard label="Servicios activos" value={stats.active_services} icon={<ProductIcon />} accentColor="var(--brand)" />
      <StatsCard label={<>Factura pendiente <HelpTip text="Importe total de las facturas que aún no se han cobrado. Se cobrarán automáticamente en la fecha de vencimiento." /></>} value={formatCurrency(stats.pending_invoice_amount)} icon={<InvoiceIcon />} accentColor={stats.pending_invoice_amount > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
      <StatsCard label={<>Próxima renovación <HelpTip text="Fecha en la que se renueva automáticamente tu servicio más próximo. Se genera una factura unos días antes." /></>} value={formatDate(stats.next_renewal)} icon={<CalendarIcon />} accentColor="var(--info)" subtext={stats.next_renewal ? undefined : 'Sin servicios activos'} />
      <StatsCard label="Conversaciones abiertas" value={stats.open_conversations} icon={<TicketIcon />} accentColor={stats.open_conversations > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
      <Link
        href="/dashboard/support-inside"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        aria-label="Ver Support Inside"
      >
        <StatsCard
          label={<>Support Inside <HelpTip text="Tu tier de cuenta: soporte humano prioritario, slots de mantenimiento y canales premium. Se gestiona en /dashboard/support-inside." /></>}
          value={siValue}
          icon={<ShieldIcon />}
          accentColor={siAccent}
          subtext={siSubtext}
        />
      </Link>
    </div>
  );
}

export function AgentStats({ stats }: { stats: AgentOverview }) {
  return (
    <div className={styles.statsGridThree}>
      <StatsCard label="Chats esperando" value={stats.waiting_chats} icon={<ChatIcon />} accentColor={stats.waiting_chats > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
      <StatsCard label="Tickets sin responder" value={stats.unanswered_tickets} icon={<TicketIcon />} accentColor={stats.unanswered_tickets > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
      <StatsCard label="Tareas hoy" value={stats.tasks_today} icon={<TaskIcon />} accentColor={stats.tasks_today > 0 ? 'var(--brand)' : 'var(--text-tertiary)'} />
    </div>
  );
}

export function PartnerStats({ stats }: { stats: PartnerOverview }) {
  return (
    <div className={styles.statsGridThree}>
      <StatsCard label="Clientes referidos" value={stats.referred_clients} icon={<UsersIcon />} accentColor="var(--brand)" />
      <StatsCard label="Comisiones del mes" value={formatCurrency(stats.commissions_this_month)} icon={<EuroIcon />} accentColor="var(--success)" />
      <StatsCard label="Próxima liquidación" value={formatDate(stats.next_settlement)} icon={<CalendarIcon />} accentColor="var(--info)" subtext={stats.next_settlement ? undefined : 'Pendiente de programar'} />
    </div>
  );
}

export { formatCurrency, formatDate };

import React from 'react';
import Link from 'next/link';
import { Badge } from '../../components/ui';
import { AlertIcons } from './icons';
import { UsersIcon, InvoiceIcon, TicketIcon, ChatIcon, ProductIcon } from './icons';
import type { OverviewStats } from '../../lib/api';
import { formatCurrency } from './StatsGrids';
import styles from '../overview.module.css';

/* ═══════════════════════════════════════
   Overview Sections — Alerts + Quick Actions
   Extracted from overview page per Regla 15.
   Ref: UI_SPEC.md §2.3
   ═══════════════════════════════════════ */

const ADMIN_ROLES = ['superadmin', 'agent_full'];
const AGENT_ROLES = ['agent_billing', 'agent_support'];

/* ── Alert types ── */

interface Alert {
  id: string;
  title: string;
  meta: string;
  type: 'warning' | 'danger' | 'info';
  href: string;
}

export function buildAlerts(stats: OverviewStats): Alert[] {
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
        href: '/admin/support/chats',
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
    if (stats.open_chats > 0) {
      alerts.push({
        id: 'chats',
        title: `${stats.open_chats} chat${stats.open_chats > 1 ? 's' : ''} activo${stats.open_chats > 1 ? 's' : ''}`,
        meta: 'Conversaciones en tiempo real',
        type: 'warning',
        href: '/admin/support/chats',
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
    if (stats.open_conversations > 0) {
      alerts.push({
        id: 'conversations',
        title: `${stats.open_conversations} conversación${stats.open_conversations > 1 ? 'es' : ''} en curso`,
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
        href: '/admin/support/chats',
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

/* ── Alert list renderer ── */

export function AlertList({ alerts }: { alerts: Alert[] }) {
  return (
    <>
      {alerts.map((alert) => {
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
      })}
    </>
  );
}

/* ── Quick actions ── */

interface QuickAction {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

export function getQuickActions(roleSlug: string): QuickAction[] {
  // _isAdmin reservado para condiciones futuras de quick actions admin-only
  const _isAdmin = ADMIN_ROLES.includes(roleSlug);
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
      { href: '/admin/support/chats', icon: <ChatIcon />, title: 'Chats en vivo', desc: 'Panel de agente' },
      { href: '/dashboard/support', icon: <TicketIcon />, title: 'Tickets', desc: 'Gestionar tickets' },
      { href: '/admin/clients', icon: <UsersIcon />, title: 'Clientes', desc: 'Buscar clientes' },
    ];
  }

  // Admin (Sprint 9.6 + ADR-066: Portal de Administración → /admin/*)
  return [
    { href: '/admin/clients', icon: <UsersIcon />, title: 'Clientes', desc: 'Gestionar clientes' },
    { href: '/dashboard/billing', icon: <InvoiceIcon />, title: 'Facturación', desc: 'Ver facturas' },
    { href: '/admin/products', icon: <ProductIcon />, title: 'Productos', desc: 'Catálogo de servicios' },
    { href: '/dashboard/support', icon: <TicketIcon />, title: 'Soporte', desc: 'Tickets y chats' },
    { href: '/admin/support/chats', icon: <ChatIcon />, title: 'Chats en vivo', desc: 'Panel de agente' },
  ];
}

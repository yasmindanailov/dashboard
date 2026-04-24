'use client';

import Link from 'next/link';
import { Badge, EmptyState } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';

/* ═══════════════════════════════════════
   ClientSupportTab — Chats & tickets history
   Migrated to DS: Badge, EmptyState
   Ref: DECISIONS.md 7.H15, ROADMAP.md D22
   ═══════════════════════════════════════ */

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Abierto', variant: 'info' },
  waiting_agent: { label: 'Esperando', variant: 'danger' },
  resolved: { label: 'Resuelto', variant: 'success' },
  closed: { label: 'Cerrado', variant: 'neutral' },
};

interface ClientSupportTabProps {
  loading: boolean;
  chats: any[];
  tickets: any[];
  /** For cross-module referrer links (P6.1) */
  clientId?: string;
  clientName?: string;
}

function ConversationRow({ item, type, fromParams }: { item: any; type: 'chat' | 'ticket'; fromParams: string }) {
  const status = STATUS_BADGE[item.status] || { label: item.status, variant: 'neutral' as BadgeVariant };
  return (
    <Link href={`/dashboard/support/${item.id}${fromParams}`}
      className="flex items-center justify-between p-3 rounded-lg transition-all duration-150"
      style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)', textDecoration: 'none' }}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {item.subject}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
          <span>{new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {type === 'ticket' && item.category && <span style={{ color: 'var(--text-secondary)' }}>· {item.category}</span>}
        </div>
      </div>
      <Badge variant={status.variant}>{status.label}</Badge>
    </Link>
  );
}

const ChatIcon = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function ClientSupportTab({ loading, chats, tickets, clientId, clientName }: ClientSupportTabProps) {
  // Build ?from= query string for cross-module links (P6.1)
  const fromParams = clientId && clientName
    ? `?from=${encodeURIComponent(`/dashboard/clients/${clientId}`)}&fromLabel=${encodeURIComponent(`Perfil de ${clientName}`)}`
    : '';

  if (loading) {
    return <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>Cargando historial...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Chats */}
      <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Chats en vivo ({chats.length})
        </h2>
        {chats.length === 0 ? (
          <EmptyState icon={ChatIcon} title="Sin chats" description="Este cliente no tiene chats en vivo." />
        ) : (
          <div className="space-y-2">
            {chats.map((c: any) => <ConversationRow key={c.id} item={c} type="chat" fromParams={fromParams} />)}
          </div>
        )}
      </div>

      {/* Tickets */}
      <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Tickets ({tickets.length})
        </h2>
        {tickets.length === 0 ? (
          <EmptyState icon={ChatIcon} title="Sin tickets" description="Este cliente no tiene tickets de soporte." />
        ) : (
          <div className="space-y-2">
            {tickets.map((t: any) => <ConversationRow key={t.id} item={t} type="ticket" fromParams={fromParams} />)}
          </div>
        )}
      </div>
    </div>
  );
}

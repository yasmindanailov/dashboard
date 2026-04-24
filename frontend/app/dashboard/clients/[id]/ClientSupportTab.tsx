'use client';

import Link from 'next/link';
import { Badge, EmptyState } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   ClientSupportTab — Chats & tickets history
   Migrated to DS: Badge, EmptyState, CSS Module
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
    <Link href={`/dashboard/support/${item.id}${fromParams}`} className={styles.convItem}>
      <div className={styles.convItemContent}>
        <div className={styles.convItemSubject}>
          {item.subject}
        </div>
        <div className={styles.convItemMeta}>
          <span>{new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {type === 'ticket' && item.category && <span>· {item.category}</span>}
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
    return <div className={styles.emptyText}>Cargando historial...</div>;
  }

  return (
    <div className={styles.stack}>
      {/* Chats */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Chats en vivo ({chats.length})
        </h2>
        {chats.length === 0 ? (
          <EmptyState icon={ChatIcon} title="Sin chats" description="Este cliente no tiene chats en vivo." />
        ) : (
          <div className={styles.stackSm}>
            {chats.map((c: any) => <ConversationRow key={c.id} item={c} type="chat" fromParams={fromParams} />)}
          </div>
        )}
      </div>

      {/* Tickets */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Tickets ({tickets.length})
        </h2>
        {tickets.length === 0 ? (
          <EmptyState icon={ChatIcon} title="Sin tickets" description="Este cliente no tiene tickets de soporte." />
        ) : (
          <div className={styles.stackSm}>
            {tickets.map((t: any) => <ConversationRow key={t.id} item={t} type="ticket" fromParams={fromParams} />)}
          </div>
        )}
      </div>
    </div>
  );
}

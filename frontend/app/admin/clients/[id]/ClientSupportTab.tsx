'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Ticket as TicketIcon } from 'lucide-react';
import { Badge, EmptyState, IconWell, Pagination } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import type { Conversation } from '../../../lib/types';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   ClientSupportTab (F4·U22) — dos listas (Chats en vivo / Tickets) 1:1 con el
   mockup, con paginación cliente por lista. Datos eager desde el SC.
   ═══════════════════════════════════════ */

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Abierto', variant: 'info' },
  waiting_agent: { label: 'Esperando', variant: 'danger' },
  resolved: { label: 'Resuelto', variant: 'success' },
  closed: { label: 'Cerrado', variant: 'neutral' },
};

const PAGE_SIZE = 6;

function ConversationRow({
  item,
  type,
  fromParams,
}: {
  item: Conversation;
  type: 'chat' | 'ticket';
  fromParams: string;
}) {
  const status =
    STATUS_BADGE[item.status] || { label: item.status, variant: 'neutral' as BadgeVariant };
  const date = new Date(item.created_at).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const metaParts = [type === 'chat' ? 'Chat' : 'Ticket', date];
  if (type === 'ticket' && item.category) metaParts.push(item.category);

  return (
    <Link
      href={`/dashboard/support/${item.id}${fromParams}`}
      className={styles.supportRow}
    >
      <IconWell
        icon={type === 'chat' ? MessageCircle : TicketIcon}
        tone={type === 'chat' ? 'brand' : 'neutral'}
        size="md"
      />
      <span className={styles.supportRowBody}>
        <span className={styles.supportRowSubject}>{item.subject}</span>
        <span className={styles.supportRowMeta}>{metaParts.join(' · ')}</span>
      </span>
      <Badge variant={status.variant}>{status.label}</Badge>
    </Link>
  );
}

function ConversationListCard({
  title,
  items,
  type,
  fromParams,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  items: Conversation[];
  type: 'chat' | 'ticket';
  fromParams: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  return (
    <div className={styles.supportCard}>
      <div className={styles.supportCardHead}>
        <h2 className={styles.supportCardTitle}>{title}</h2>
        <span className={styles.supportCardCount}>
          {items.length} {items.length === 1 ? 'conversación' : 'conversaciones'}
        </span>
      </div>
      {items.length === 0 ? (
        <div className={styles.supportEmpty}>
          <EmptyState
            icon={
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      ) : (
        <>
          <div className={styles.supportRows}>
            {pageItems.map((c) => (
              <ConversationRow key={c.id} item={c} type={type} fromParams={fromParams} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className={styles.supportPagination}>
              <Pagination
                page={safePage}
                totalPages={totalPages}
                total={items.length}
                limit={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ClientSupportTabProps {
  loading: boolean;
  chats: Conversation[];
  tickets: Conversation[];
  clientId?: string;
  clientName?: string;
}

export default function ClientSupportTab({
  loading,
  chats,
  tickets,
  clientId,
  clientName,
}: ClientSupportTabProps) {
  const fromParams =
    clientId && clientName
      ? `?from=${encodeURIComponent(`/admin/clients/${clientId}`)}&fromLabel=${encodeURIComponent(`Perfil de ${clientName}`)}`
      : '';

  if (loading) {
    return <div className={styles.emptyText}>Cargando historial…</div>;
  }

  return (
    <div className={styles.stack}>
      <ConversationListCard
        title="Chats en vivo"
        items={chats}
        type="chat"
        fromParams={fromParams}
        emptyTitle="Sin chats"
        emptyDescription="Este cliente no tiene chats en vivo."
      />
      <ConversationListCard
        title="Tickets"
        items={tickets}
        type="ticket"
        fromParams={fromParams}
        emptyTitle="Sin tickets"
        emptyDescription="Este cliente no tiene tickets de soporte."
      />
    </div>
  );
}

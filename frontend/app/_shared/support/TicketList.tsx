'use client';

import Link from 'next/link';
import type { Ticket } from './types';
import { STATUS_CONFIG, PRIORITY_CONFIG, timeAgo, getDisplayTitle } from './types';
import { Badge, Card, EmptyState, Skeleton, Pagination } from '../../components/ui';
import styles from './TicketList.module.css';

/* ═══════════════════════════════════════
   TicketList — Ticket conversation list
   Migrated to DS: Badge, Card, EmptyState,
   Skeleton, Pagination + CSS module
   Ref: DECISIONS.md §43, ROADMAP.md D22
   ═══════════════════════════════════════ */


const ChatIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

interface TicketListProps {
  tickets: Ticket[];
  loading: boolean;
  isAdmin: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function TicketList({
  tickets, loading, isAdmin, page, totalPages, onPageChange,
}: TicketListProps) {
  if (loading) {
    return (
      <div className={styles.list}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <div className={styles.skeletonRow}>
              <Skeleton width={4} height={48} />
              <div className={styles.skeletonContent}>
                <Skeleton width="60%" height={16} />
                <div className={styles.skeletonMeta}><Skeleton width="80%" height={12} /></div>
              </div>
              <Skeleton width={40} height={12} />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ChatIcon}
          title="No hay conversaciones"
          description={isAdmin ? 'No hay conversaciones con estos filtros.' : 'Crea una nueva conversación para contactar con el equipo.'}
        />
      </Card>
    );
  }

  return (
    <>
      <div className={styles.list}>
        {tickets.map((conv) => {
          const status = STATUS_CONFIG[conv.status] || STATUS_CONFIG.open;
          // _priority reservado para mostrar badge en próxima iteración del diseño
          const _priority = PRIORITY_CONFIG[conv.priority] || PRIORITY_CONFIG.normal;
          const lastMessage = conv.messages?.[0];
          const preview = lastMessage?.body?.length > 120
            ? lastMessage.body.substring(0, 120) + '...'
            : lastMessage?.body || '';

          return (
            <Link key={conv.id} href={`/dashboard/support/${conv.id}`} className={styles.ticketLink}>
              <Card variant="interactive">
                <div className={styles.row}>
                  {/* Priority indicator */}
                  <div className={styles.priority} data-priority={conv.priority} />

                  {/* Content */}
                  <div className={styles.content}>
                    <div className={styles.titleRow}>
                      <span className={styles.subject}>{getDisplayTitle(conv)}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {conv.priority === 'urgent' && <Badge variant="danger">URGENTE</Badge>}
                    </div>
                    <div className={styles.preview}>{preview}</div>
                  </div>

                  {/* Meta */}
                  <div className={styles.meta}>
                    <div className={styles.metaLine}>{timeAgo(conv.updated_at)}</div>
                    <div className={styles.metaLine}>{conv.channel}</div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </>
  );
}

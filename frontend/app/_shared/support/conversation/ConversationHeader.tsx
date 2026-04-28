'use client';

import Link from 'next/link';
import type { ConversationDetail } from './types';
import { STATUS_CONFIG, PRIORITY_OPTIONS, CATEGORY_LABELS, formatDate } from './types';
import { Badge, Select, Button } from '../../../components/ui';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   ConversationHeader — Title, badges, actions
   DS components: Badge, Select, Button
   Ref: UI_SPEC §2.5, ROADMAP.md D25
   ═══════════════════════════════════════ */

interface ConversationHeaderProps {
  conversation: ConversationDetail;
  isAdmin: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onEscalateToTicket: () => void;
}

export default function ConversationHeader({
  conversation, isAdmin, onStatusChange, onPriorityChange, onEscalateToTicket,
}: ConversationHeaderProps) {
  const status = STATUS_CONFIG[conversation.status] || STATUS_CONFIG.open;
  const isChat = conversation.type === 'chat';
  const isTicket = conversation.type === 'ticket';

  return (
    <div className={styles.headerRow}>
      <div>
        <h1 className={styles.headerTitle}>{conversation.subject}</h1>
        <div className={styles.headerMeta}>
          {/* Type badge */}
          <Badge variant={isChat ? 'brand' : 'neutral'}>
            {isChat ? 'Chat' : 'Ticket'}
          </Badge>
          {/* Status */}
          <Badge variant={status.variant}>{status.label}</Badge>
          {/* Category */}
          {isTicket && conversation.category && conversation.category !== 'escalated_chat' && (
            <Badge variant="neutral">
              {CATEGORY_LABELS[conversation.category] || conversation.category}
            </Badge>
          )}
          {/* Escalation link */}
          {conversation.escalated_from_id && (
            <Link href={`/dashboard/support/${conversation.escalated_from_id}`} className={styles.escalationLink}>
              Escalado desde chat
            </Link>
          )}
          <span className={styles.headerMetaText}>Canal: {conversation.channel}</span>
          <span className={styles.headerMetaText}>Creada: {formatDate(conversation.created_at)}</span>
        </div>
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className={styles.headerActions}>
          <Select
            value={conversation.priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            options={PRIORITY_OPTIONS}
            size="sm"
          />

          {conversation.status !== 'closed' && (
            <>
              {conversation.status !== 'resolved' && (
                <Button variant="secondary" size="sm" onClick={() => onStatusChange('resolved')}>
                  Resolver
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => onStatusChange('closed')}>
                Cerrar
              </Button>
            </>
          )}
          {conversation.status === 'closed' && (
            <Button variant="secondary" size="sm" onClick={() => onStatusChange('open')}>
              Reabrir
            </Button>
          )}
          {isChat && conversation.status !== 'closed' && conversation.status !== 'resolved' && (
            <Button variant="secondary" size="sm" onClick={onEscalateToTicket}>
              Escalar a ticket
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

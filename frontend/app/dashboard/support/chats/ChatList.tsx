'use client';

import type { Chat } from './types';
import { STATUS_BADGE, timeAgo } from './types';
import { SearchInput, Badge, StatusDot, Skeleton, EmptyState } from '../../../components/ui';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   ChatList — Left column of agent panel
   Displays list of active chats with
   search, assignment indicators, and
   status badges.
   Ref: DECISIONS.md §43, 7.H7, 7.H8
   ═══════════════════════════════════════ */

/** Map chat status to Badge variant */
const STATUS_TO_VARIANT: Record<string, 'info' | 'warning' | 'danger' | 'success' | 'neutral'> = {
  open: 'info',
  waiting_client: 'warning',
  waiting_agent: 'danger',
  resolved: 'success',
  closed: 'neutral',
};

/** Map assignment to StatusDot color */
function getAssignmentDot(
  isMine: boolean,
  isUnassigned: boolean,
): { color: 'success' | 'neutral' | 'warning'; label: string } {
  if (isMine) return { color: 'success', label: 'Asignado a ti' };
  if (isUnassigned) return { color: 'neutral', label: 'Sin asignar' };
  return { color: 'warning', label: 'Asignado a otro' };
}

interface ChatListProps {
  chats: Chat[];
  activeChat: Chat | null;
  loadingChats: boolean;
  chatSearch: string;
  currentUserId: string | undefined;
  onSearchChange: (value: string) => void;
  onSelectChat: (chatId: string) => void;
}

export default function ChatList({
  chats, activeChat, loadingChats,
  chatSearch, currentUserId,
  onSearchChange, onSelectChat,
}: ChatListProps) {
  return (
    <div className={styles.listColumn}>
      {/* Header */}
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Chats en vivo</h2>
        <SearchInput
          value={chatSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          onClear={() => onSearchChange('')}
          placeholder="Buscar chats..."
          size="sm"
        />
      </div>

      {/* Chat list */}
      <div className={styles.listBody}>
        {loadingChats ? (
          <div className={styles.skeletonContainer}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonItem}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="80%" height={12} className={styles.skeletonLine} />
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <EmptyState
            icon={
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            title="Sin chats activos"
            description="Los chats de clientes aparecerán aquí en tiempo real"
          />
        ) : (
          chats.map((chat) => {
            const isActive = activeChat?.id === chat.id;
            const status = STATUS_BADGE[chat.status] || STATUS_BADGE.open;
            const lastMsg = chat.messages?.[0];
            const isMine = chat.assigned_agent_id === currentUserId;
            const isUnassigned = !chat.assigned_agent_id;
            const assignment = getAssignmentDot(isMine, isUnassigned);
            const badgeVariant = STATUS_TO_VARIANT[chat.status] || 'neutral';

            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`${styles.chatItem} ${isActive ? styles.chatItemActive : ''}`}
              >
                <div className={styles.chatItemRow}>
                  <div className={styles.chatItemIdentity}>
                    {/* 7.H8: Assignment indicator */}
                    <StatusDot color={assignment.color} />
                    <span className={styles.chatItemSubject} title={chat.subject}>
                      {chat.subject}
                    </span>
                  </div>
                  <span className={styles.chatItemTime}>{timeAgo(chat.updated_at)}</span>
                </div>
                <div className={styles.chatItemPreview}>
                  <span className={styles.chatItemBody}>
                    {lastMsg?.body?.substring(0, 60) || 'Sin mensajes'}
                  </span>
                  <Badge variant={badgeVariant}>{status.label}</Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

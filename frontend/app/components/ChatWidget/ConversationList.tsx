'use client';

import type { Conversation } from './types';
import { STATUS_LABEL } from './types';
import styles from './chatWidget.module.css';

/* ═══════════════════════════════════════
   ConversationList — Chat list view
   Shows recent conversations and a CTA
   to start a new chat.
   Ref: DECISIONS.md §9, 7.H20
   ═══════════════════════════════════════ */

interface ConversationListProps {
  conversations: Conversation[];
  sending: boolean;
  onStartChat: () => void;
  onSelectConversation: (id: string) => void;
}

export default function ConversationList({
  conversations, sending,
  onStartChat, onSelectConversation,
}: ConversationListProps) {
  return (
    <div className={styles.listContainer}>
      {/* CTA: Start new conversation (7.H20) */}
      <div className={styles.listCta}>
        <button
          className={styles.ctaButton}
          onClick={onStartChat}
          disabled={sending}
        >
          {sending ? 'Iniciando...' : 'Empezar conversación'}
        </button>
      </div>

      {/* Conversation list with scroll */}
      <div className={styles.listScroll}>
        {conversations.length === 0 ? (
          <div className={styles.listEmpty}>
            Sin conversaciones previas
          </div>
        ) : (
          <>
            <div className={styles.listLabel}>
              Conversaciones recientes
            </div>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={styles.convItem}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className={styles.convSubject}>
                  {conv.subject}
                </div>
                <div className={styles.convStatus}>
                  {STATUS_LABEL[conv.status] || conv.status}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

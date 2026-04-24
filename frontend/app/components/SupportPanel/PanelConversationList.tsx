'use client';

import type { Conversation } from '../ChatWidget/types';
import { STATUS_LABEL } from '../ChatWidget/types';
import { Button, EmptyState } from '../ui';
import styles from './SupportPanel.module.css';

/* ═══════════════════════════════════════
   PanelConversationList — list view
   Shows recent conversations and CTA.
   Ref: UI_SPEC.md §3.9
   ═══════════════════════════════════════ */

interface PanelConversationListProps {
  conversations: Conversation[];
  sending: boolean;
  onStartChat: () => void;
  onSelectConversation: (id: string) => void;
}

export default function PanelConversationList({
  conversations, sending,
  onStartChat, onSelectConversation,
}: PanelConversationListProps) {
  return (
    <div className={styles.listContainer}>
      {/* CTA: Start new conversation */}
      <div className={styles.newChatBtn}>
        <Button
          onClick={onStartChat}
          disabled={sending}
          className={styles.fullWidth}
        >
          {sending ? 'Iniciando...' : 'Nueva conversación'}
        </Button>
      </div>

      {/* Conversation list */}
      <div className={styles.listScroll}>
        {conversations.length === 0 ? (
          <EmptyState
            title="Sin conversaciones"
            description="Inicia una conversación con nuestro equipo de soporte."
          />
        ) : (
          <>
            <div className={styles.listLabel}>Conversaciones recientes</div>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={styles.convItem}
                onClick={() => onSelectConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectConversation(conv.id);
                }}
              >
                <div className={styles.convSubject}>{conv.subject}</div>
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

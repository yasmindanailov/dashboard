'use client';

import type { RefObject } from 'react';
import type { DetailMessage } from './types';
import { formatDate } from './types';
import { Button } from '../../../components/ui';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   ConversationMessages — Message list + input
   DS components: Button
   CSS module: zero inline styles
   Ref: UI_SPEC §2.5, ROADMAP.md D25
   ═══════════════════════════════════════ */

interface ConversationMessagesProps {
  messages: DetailMessage[];
  isClosed: boolean;
  isAdmin: boolean;
  currentUserId?: string;
  newMessage: string;
  isInternal: boolean;
  sending: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onMessageChange: (v: string) => void;
  onInternalChange: (v: boolean) => void;
  onSend: () => void;
}

export default function ConversationMessages({
  messages, isClosed, isAdmin, currentUserId,
  newMessage, isInternal, sending, messagesEndRef,
  onMessageChange, onInternalChange, onSend,
}: ConversationMessagesProps) {
  return (
    <div className={styles.messagesContainer}>
      {/* Message list */}
      <div className={styles.messagesList}>
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          const isSystem = msg.sender_type === 'system';
          const isAgent = msg.sender_type === 'agent';

          if (isSystem) {
            return (
              <div key={msg.id} className={styles.systemMessage}>
                {msg.body} · {formatDate(msg.created_at)}
              </div>
            );
          }

          const bubbleClass = msg.is_internal
            ? styles.bubbleInternal
            : isMe
              ? styles.bubbleMine
              : styles.bubbleTheirs;

          const senderClass = msg.is_internal
            ? styles.bubbleSenderInternal
            : isMe
              ? styles.bubbleSenderMine
              : styles.bubbleSenderTheirs;

          const timeClass = isMe
            ? styles.bubbleTimeMine
            : styles.bubbleTimeTheirs;

          // Determine sender label
          let senderLabel = '';
          if (msg.is_internal) senderLabel = 'Nota interna';
          else if (isMe) senderLabel = 'Tú';
          else if (isAgent) senderLabel = 'Agente';
          else if (msg.sender_type === 'client') senderLabel = 'Cliente';

          return (
            <div key={msg.id} className={`${styles.bubbleWrap} ${isMe ? styles.bubbleWrapMine : styles.bubbleWrapTheirs}`}>
              <div className={`${styles.bubble} ${bubbleClass}`}>
                <div className={`${styles.bubbleSender} ${senderClass}`}>
                  {senderLabel}
                </div>
                <div>{msg.body}</div>
                <div className={`${styles.bubbleTime} ${timeClass}`}>
                  {formatDate(msg.created_at)}
                  {msg.read_at && ' ✓✓'}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      {!isClosed && (
        <div className={`${styles.inputArea} ${isInternal ? styles.inputAreaInternal : ''}`}>
          {/* Internal toggle (admin only) */}
          {isAdmin && (
            <div>
              <label className={`${styles.internalToggle} ${isInternal ? styles.internalToggleActive : styles.internalToggleInactive}`}>
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => onInternalChange(e.target.checked)}
                />
                Nota interna (solo visible para agentes)
              </label>
            </div>
          )}

          <div className={styles.inputRow}>
            <textarea
              value={newMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder={isInternal ? 'Escribe una nota interna...' : 'Escribe tu mensaje...'}
              rows={2}
              className={`${styles.messageTextarea} ${isInternal ? styles.messageTextareaInternal : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <Button
              onClick={onSend}
              disabled={sending || !newMessage.trim()}
              loading={sending}
              size="sm"
            >
              Enviar
            </Button>
          </div>
        </div>
      )}

      {/* Closed notice */}
      {isClosed && (
        <div className={styles.closedNotice}>
          Esta conversación está cerrada.
        </div>
      )}
    </div>
  );
}

'use client';

import { RefObject } from 'react';
import type { Chat, Message } from './types';
import { STATUS_BADGE, formatTime } from './types';
import { Button, EmptyState } from '../../../components/ui';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   ChatConversation — Center column
   Displays chat messages, typing indicator,
   internal note toggle, and message input.
   Ref: DECISIONS.md §43, 7.H1, 7.H13
   ═══════════════════════════════════════ */

interface ChatConversationProps {
  activeChat: Chat | null;
  currentUserId: string | undefined;
  typingIndicator: boolean;
  message: string;
  internalNote: boolean;
  sending: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onMessageChange: (value: string) => void;
  onInternalNoteChange: (checked: boolean) => void;
  onSend: () => void;
  onTyping: () => void;
  onResolve: () => void;
  onClose: () => void;
}

export default function ChatConversation({
  activeChat, currentUserId, typingIndicator,
  message, internalNote, sending, messagesEndRef,
  onMessageChange, onInternalNoteChange, onSend, onTyping,
  onResolve, onClose,
}: ChatConversationProps) {
  if (!activeChat) {
    return (
      <div className={styles.conversationColumn}>
        <div className={styles.conversationEmpty}>
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            title="Selecciona un chat para comenzar"
            description="Elige una conversación de la lista para ver los mensajes"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.conversationColumn}>
      {/* Chat header — topbar actions: Resolver + Cerrar (7.H24) */}
      <div className={styles.conversationHeader}>
        <div className={styles.conversationHeaderInfo}>
          <h3>{activeChat.subject}</h3>
          <div className={styles.conversationStatus}>
            {typingIndicator ? 'Cliente escribiendo...' : STATUS_BADGE[activeChat.status]?.label || activeChat.status}
          </div>
        </div>
        <div className={styles.conversationHeaderActions}>
          <Button variant="secondary" size="sm" onClick={onResolve} title="Marcar como resuelto">
            Resolver
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} title="Cerrar conversación">
            Cerrar
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messagesArea}>
        {activeChat.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isMe={msg.sender_id === currentUserId} />
        ))}

        {typingIndicator && (
          <div className={styles.typingIndicator}>
            Cliente escribiendo...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {activeChat.status !== 'closed' && (
        <div className={styles.inputArea}>
          <div className={styles.internalToggle}>
            <label className={`${styles.internalLabel} ${internalNote ? styles.internalLabelActive : ''}`}>
              <input
                type="checkbox"
                checked={internalNote}
                onChange={(e) => onInternalNoteChange(e.target.checked)}
                className={styles.internalCheckbox}
              />
              Nota interna (solo visible para agentes)
            </label>
          </div>
          <div className={styles.inputRow}>
            <input
              value={message}
              onChange={(e) => { onMessageChange(e.target.value); onTyping(); }}
              placeholder={internalNote ? 'Escribe una nota interna...' : 'Escribe un mensaje al cliente...'}
              className={`${styles.messageInput} ${internalNote ? styles.messageInputInternal : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
              }}
            />
            <button
              onClick={onSend}
              disabled={sending || !message.trim()}
              className={`${styles.sendButton} ${internalNote ? styles.sendButtonInternal : ''}`}
            >
              {internalNote ? '↵' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Message Bubble (private sub-component) ─── */

function MessageBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const isSystem = msg.sender_type === 'system';
  const isInternal = msg.is_internal;

  if (isSystem) {
    return <div className={styles.systemMessage}>{msg.body}</div>;
  }

  const senderClass = isInternal
    ? styles.messageSenderInternal
    : isMe
      ? styles.messageSenderAgent
      : styles.messageSenderClient;

  const bubbleClass = isInternal
    ? styles.bubbleInternal
    : isMe
      ? styles.bubbleAgent
      : styles.bubbleClient;

  const metaClass = isInternal
    ? styles.bubbleMetaInternal
    : isMe
      ? styles.bubbleMetaAgent
      : styles.bubbleMetaClient;

  return (
    <div className={`${styles.messageWrapper} ${isMe ? styles.messageAlignRight : styles.messageAlignLeft}`}>
      {/* 7.H13: Sender name */}
      {msg.sender_name && (
        <div className={`${styles.messageSender} ${senderClass}`}>
          {msg.sender_name}
        </div>
      )}
      <div className={`${styles.bubble} ${bubbleClass}`}>
        {isInternal && <div className={styles.bubbleInternalLabel}>Nota interna</div>}
        <div className={styles.bubbleBody}>{msg.body}</div>
        <div className={`${styles.bubbleMeta} ${metaClass}`}>
          {formatTime(msg.created_at)}
          {msg.read_at && <span className={styles.readReceipt}>✓✓</span>}
        </div>
      </div>
    </div>
  );
}

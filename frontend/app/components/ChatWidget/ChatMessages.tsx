'use client';

import { RefObject } from 'react';
import type { Conversation, Message } from './types';
import { formatTime } from './types';
import styles from './chatWidget.module.css';

/* ═══════════════════════════════════════
   ChatMessages — Active chat view
   Renders message bubbles, typing indicator,
   and message input.
   Ref: DECISIONS.md §9, 7.H1, 7.H13
   ═══════════════════════════════════════ */

interface ChatMessagesProps {
  conversation: Conversation;
  isGuest: boolean;
  currentUserId: string | undefined;
  typingIndicator: boolean;
  message: string;
  sending: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onTyping: () => void;
}

export default function ChatMessages({
  conversation, isGuest, currentUserId,
  typingIndicator, message, sending, messagesEndRef,
  onMessageChange, onSend, onTyping,
}: ChatMessagesProps) {
  return (
    <>
      <div className={styles.messagesScroll}>
        {conversation.messages.map((msg) => (
          <WidgetBubble
            key={msg.id}
            msg={msg}
            isMe={isGuest ? msg.sender_type === 'client' : msg.sender_id === currentUserId}
          />
        ))}

        {typingIndicator && (
          <div className={styles.typingIndicator}>
            Agente escribiendo...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      {conversation.status !== 'closed' && (
        <div className={styles.inputBar}>
          <input
            className={styles.messageInput}
            value={message}
            onChange={(e) => { onMessageChange(e.target.value); onTyping(); }}
            placeholder="Escribe un mensaje..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
          />
          <button
            className={styles.sendButton}
            onClick={onSend}
            disabled={sending || !message.trim()}
          >
            Enviar
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Private: Widget Message Bubble ─── */

function WidgetBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  if (msg.sender_type === 'system') {
    return <div className={styles.systemMessage}>{msg.body}</div>;
  }

  return (
    <div className={`${styles.bubbleRow} ${isMe ? styles.bubbleRowMe : styles.bubbleRowOther}`}>
      {/* 7.H13: Sender name */}
      {msg.sender_name && (
        <div className={`${styles.bubbleSender} ${isMe ? styles.bubbleSenderMe : styles.bubbleSenderOther}`}>
          {isMe ? 'Tú' : msg.sender_name}
        </div>
      )}
      <div className={`${styles.bubbleBody} ${isMe ? styles.bubbleMe : styles.bubbleOther}`}>
        <div className={styles.bubbleText}>{msg.body}</div>
        <div className={`${styles.bubbleTime} ${isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther}`}>
          {formatTime(msg.created_at)}
          {msg.read_at && ' ✓✓'}
        </div>
      </div>
    </div>
  );
}

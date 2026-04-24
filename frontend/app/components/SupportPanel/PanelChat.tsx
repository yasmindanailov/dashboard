'use client';

import { RefObject } from 'react';
import type { Conversation, Message } from '../ChatWidget/types';
import { formatTime } from '../ChatWidget/types';
import styles from './SupportPanel.module.css';

/* ═══════════════════════════════════════
   PanelChat — Active chat view
   Renders message bubbles, typing indicator,
   and message input.
   Ref: UI_SPEC.md §3.9, DECISIONS.md §9
   ═══════════════════════════════════════ */

interface PanelChatProps {
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

export default function PanelChat({
  conversation, isGuest, currentUserId,
  typingIndicator, message, sending, messagesEndRef,
  onMessageChange, onSend, onTyping,
}: PanelChatProps) {
  return (
    <>
      {/* Messages */}
      <div className={styles.messages}>
        {conversation.messages.map((msg) => (
          <PanelBubble
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

      {/* Input */}
      {conversation.status !== 'closed' && (
        <div className={styles.inputArea}>
          <input
            value={message}
            onChange={(e) => { onMessageChange(e.target.value); onTyping(); }}
            placeholder="Escribe un mensaje..."
            className={styles.chatInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
          />
          <button
            onClick={onSend}
            disabled={sending || !message.trim()}
            className={styles.sendBtn}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

/* ── Private: Message Bubble ── */

function PanelBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  if (msg.sender_type === 'system') {
    return <div className={`${styles.bubble} ${styles.bubbleSystem}`}>{msg.body}</div>;
  }

  return (
    <div className={`${styles.bubbleWrap} ${isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther}`}>
      {msg.sender_name && (
        <div className={`${styles.senderName} ${isMe ? styles.senderNameMe : styles.senderNameOther}`}>
          {isMe ? 'Tú' : msg.sender_name}
        </div>
      )}
      <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleOther}`}>
        <div className={styles.bubbleBody}>{msg.body}</div>
        <div className={`${styles.bubbleTime} ${isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther}`}>
          {formatTime(msg.created_at)}
          {msg.read_at && ' ✓✓'}
        </div>
      </div>
    </div>
  );
}

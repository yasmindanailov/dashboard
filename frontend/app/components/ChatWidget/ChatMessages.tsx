'use client';

import { RefObject } from 'react';
import type { Conversation, Message } from './types';
import { formatTime } from './types';

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
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {conversation.messages.map((msg) => (
          <WidgetBubble
            key={msg.id}
            msg={msg}
            isMe={isGuest ? msg.sender_type === 'client' : msg.sender_id === currentUserId}
          />
        ))}

        {typingIndicator && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #9ca3af)', fontStyle: 'italic', padding: '4px 12px' }}>
            Agente escribiendo...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      {conversation.status !== 'closed' && (
        <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
          <input
            value={message}
            onChange={(e) => { onMessageChange(e.target.value); onTyping(); }}
            placeholder="Escribe un mensaje..."
            style={{
              flex: 1, padding: '10px 14px', border: '1px solid var(--color-border, #e5e7eb)',
              borderRadius: 10, fontSize: 13, outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
          />
          <button
            onClick={onSend}
            disabled={sending || !message.trim()}
            style={{
              padding: '10px 16px', border: 'none', borderRadius: 10,
              background: !message.trim() ? '#d1d5db' : 'var(--color-brand, #3B82F6)',
              color: '#fff', cursor: !message.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: 13,
            }}
          >
            →
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Private: Widget Message Bubble ─── */

function WidgetBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const isSystem = msg.sender_type === 'system';

  if (isSystem) {
    return (
      <div style={{
        textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary, #9ca3af)',
        fontStyle: 'italic', padding: '4px 0',
      }}>
        {msg.body}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isMe ? 'flex-end' : 'flex-start',
    }}>
      {/* 7.H13: Sender name */}
      {msg.sender_name && (
        <div style={{
          fontSize: 10, fontWeight: 600, marginBottom: 2, paddingLeft: 4, paddingRight: 4,
          color: isMe ? 'var(--color-brand, #3B82F6)' : 'var(--color-text-secondary, #6b7280)',
        }}>
          {isMe ? 'Tú' : msg.sender_name}
        </div>
      )}
      <div style={{
        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
        background: isMe ? 'var(--color-brand, #3B82F6)' : '#f3f4f6',
        color: isMe ? '#fff' : '#374151',
        borderBottomRightRadius: isMe ? 2 : 12,
        borderBottomLeftRadius: isMe ? 12 : 2,
        fontSize: 13, lineHeight: 1.5,
      }}>
        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
        <div style={{
          fontSize: 9, textAlign: 'right', marginTop: 4,
          color: isMe ? 'rgba(255,255,255,0.5)' : '#b0b8c4',
        }}>
          {formatTime(msg.created_at)}
          {msg.read_at && ' ✓✓'}
        </div>
      </div>
    </div>
  );
}

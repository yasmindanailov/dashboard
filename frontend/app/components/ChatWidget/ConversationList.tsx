'use client';

import type { Conversation } from './types';
import { STATUS_LABEL } from './types';

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* CTA: Start new conversation (7.H20) */}
      <div style={{ padding: '12px 12px 0' }}>
        <button
          onClick={onStartChat}
          disabled={sending}
          style={{
            width: '100%', padding: '12px 16px',
            background: 'linear-gradient(135deg, var(--color-brand, #3B82F6) 0%, #60A5FA 100%)',
            border: 'none', borderRadius: 12, color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.3)'; }}
        >
          {sending ? 'Iniciando...' : 'Empezar conversación'}
        </button>
      </div>

      {/* Conversation list with scroll */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {conversations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary, #9ca3af)', fontSize: 13 }}>
            Sin conversaciones previas
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #9ca3af)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Conversaciones recientes
            </div>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid #f0f0f0', marginBottom: 6, transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.04)'; e.currentTarget.style.borderColor = 'var(--color-brand, #3B82F6)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = '#f0f0f0'; }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #111827)', marginBottom: 2 }}>
                  {conv.subject}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #9ca3af)' }}>
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

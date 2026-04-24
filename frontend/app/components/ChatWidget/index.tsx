'use client';

import { useChatWidget } from './useChatWidget';
import { agentLastSeen } from './types';
import { ADMIN_ROLES } from './types';
import GuestForm from './GuestForm';
import ConversationList from './ConversationList';
import ChatMessages from './ChatMessages';

/* ═══════════════════════════════════════
   ChatWidget — Floating real-time chat bubble
   Orchestrator component: composes views from
   extracted sub-components.
   Ref: DECISIONS.md §9, ROADMAP.md 7.4.5
   ═══════════════════════════════════════ */

export default function ChatWidget() {
  const w = useChatWidget();

  // Don't show widget for agents (they use the full inbox)
  const isAdmin = w.user?.role?.slug ? ADMIN_ROLES.includes(w.user.role.slug) : false;
  if (isAdmin) return null;

  return (
    <>
      {/* Chat Panel */}
      {w.isOpen && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, width: 380, height: 520,
          background: 'var(--color-surface, #fff)', borderRadius: 20, overflow: 'hidden', zIndex: 9999,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column',
          animation: 'chatWidgetIn 0.25s ease-out',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--color-brand, #3B82F6) 0%, #60A5FA 100%)',
            padding: '16px 20px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {w.view === 'chat' ? w.activeConversation?.subject : 'Soporte'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {w.view === 'chat' && w.typingIndicator
                  ? 'Agente escribiendo...'
                  : w.view === 'chat' && w.activeConversation?.last_agent_response_at
                    ? agentLastSeen(w.activeConversation.last_agent_response_at)
                    : w.view === 'list'
                      ? 'Te ayudamos con lo que necesites'
                      : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {w.view !== 'list' && (
                <button onClick={w.closeConversation} style={{
                  border: 'none', background: 'rgba(255,255,255,0.2)', borderRadius: 8,
                  color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: 12,
                }}>
                  ← Volver
                </button>
              )}
              <button onClick={() => w.setIsOpen(false)} style={{
                border: 'none', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1,
              }}>
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {w.view === 'guest-form' && (
              <GuestForm
                guestName={w.guestName}
                guestEmail={w.guestEmail}
                message={w.message}
                sending={w.sending}
                onGuestNameChange={w.setGuestName}
                onGuestEmailChange={w.setGuestEmail}
                onMessageChange={w.setMessage}
                onSubmit={w.handleGuestFirstMessage}
              />
            )}

            {w.view === 'list' && (
              <ConversationList
                conversations={w.conversations}
                sending={w.sending}
                onStartChat={() => w.handleFirstMessage('¡Hola! Necesito ayuda.')}
                onSelectConversation={w.openConversation}
              />
            )}

            {w.view === 'chat' && w.activeConversation && (
              <ChatMessages
                conversation={w.activeConversation}
                isGuest={w.isGuest}
                currentUserId={w.user?.id}
                typingIndicator={w.typingIndicator}
                message={w.message}
                sending={w.sending}
                messagesEndRef={w.messagesEndRef}
                onMessageChange={w.setMessage}
                onSend={w.handleSend}
                onTyping={w.handleTyping}
              />
            )}
          </div>
        </div>
      )}

      {/* Floating Bubble */}
      <button
        onClick={() => w.setIsOpen(!w.isOpen)}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56,
          borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: 9999,
          background: 'linear-gradient(135deg, var(--color-brand, #3B82F6) 0%, #60A5FA 100%)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 28px rgba(59,130,246,0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.4)';
        }}
      >
        {w.isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}

        {/* Unread badge */}
        {!w.isOpen && w.unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20,
            borderRadius: 10, background: '#EF4444', color: '#fff',
            fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 5px',
            boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
          }}>
            {w.unreadCount > 9 ? '9+' : w.unreadCount}
          </div>
        )}
      </button>

      {/* Animation keyframes */}
      <style>{`
        @keyframes chatWidgetIn {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

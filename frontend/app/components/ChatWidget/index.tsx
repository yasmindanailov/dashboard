'use client';

import { useChatWidget } from './useChatWidget';
import { agentLastSeen } from './types';
import { ADMIN_ROLES } from './types';
import GuestForm from './GuestForm';
import ConversationList from './ConversationList';
import ChatMessages from './ChatMessages';
import styles from './chatWidget.module.css';

/* ═══════════════════════════════════════
   ChatWidget — Floating real-time chat bubble
   Orchestrator component: composes views from
   extracted sub-components.

   DESIGN_SYSTEM.md Exception: This widget uses its own
   CSS module (chatWidget.module.css) with --cw-* local tokens
   instead of components/ui/ because it runs in contexts
   where the dashboard token system may not be loaded.

   Ref: DECISIONS.md §9, ROADMAP.md 7.4.5
   ═══════════════════════════════════════ */

export default function ChatWidget() {
  const w = useChatWidget();

  // Don't show widget for agents (they use the full inbox)
  const isAdmin = w.user?.role?.slug ? ADMIN_ROLES.includes(w.user.role.slug) : false;
  if (isAdmin) return null;

  return (
    <div className={styles.root}>
      {/* Chat Panel */}
      {w.isOpen && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={styles.header}>
            <div>
              <div className={styles.headerTitle}>
                {w.view === 'chat' ? w.activeConversation?.subject : 'Soporte'}
              </div>
              <div className={styles.headerSubtitle}>
                {w.view === 'chat' && w.typingIndicator
                  ? 'Agente escribiendo...'
                  : w.view === 'chat' && w.activeConversation?.last_agent_response_at
                    ? agentLastSeen(w.activeConversation.last_agent_response_at)
                    : w.view === 'list'
                      ? 'Te ayudamos con lo que necesites'
                      : ''}
              </div>
            </div>
            <div className={styles.headerActions}>
              {w.view !== 'list' && (
                <button className={styles.backBtn} onClick={w.closeConversation}>
                  ← Volver
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => w.setIsOpen(false)}>
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className={styles.body}>
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
                onStartChat={() => w.handleFirstMessage()}
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
        className={styles.bubble}
        onClick={() => w.setIsOpen(!w.isOpen)}
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
          <div className={styles.unreadBadge}>
            {w.unreadCount > 9 ? '9+' : w.unreadCount}
          </div>
        )}
      </button>
    </div>
  );
}

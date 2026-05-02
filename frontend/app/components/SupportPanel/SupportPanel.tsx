'use client';

import { useEffect, useCallback } from 'react';
import { useChatWidget } from '../ChatWidget/useChatWidget';
import { agentLastSeen, ADMIN_ROLES } from '../ChatWidget/types';
import PanelConversationList from './PanelConversationList';
import PanelChat from './PanelChat';
import PanelGuestForm from './PanelGuestForm';
import styles from './SupportPanel.module.css';

/* ═══════════════════════════════════════
   SupportPanel — Sidebar chat panel
   Replaces the floating ChatWidget bubble
   with an integrated sidebar panel.
   Ref: UI_SPEC.md §3.9, ROADMAP.md D17
   ═══════════════════════════════════════ */

/* ── SVG Icons ── */

const IconClose = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBack = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

interface SupportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarCollapsed?: boolean;
}

export default function SupportPanel({ isOpen, onClose, sidebarCollapsed }: SupportPanelProps) {
  const w = useChatWidget();

  /* Don't render for admin/agent roles */
  const isAdmin = w.user?.role?.slug ? ADMIN_ROLES.includes(w.user.role.slug) : false;
  if (isAdmin || !isOpen) return null;

  return <SupportPanelInner w={w} onClose={onClose} sidebarCollapsed={sidebarCollapsed} />;
}

/* ── Inner component (avoids hook rules with early return) ── */

function SupportPanelInner({
  w,
  onClose,
  sidebarCollapsed: _sidebarCollapsed,
}: {
  w: ReturnType<typeof useChatWidget>;
  onClose: () => void;
  sidebarCollapsed?: boolean;
}) {
  /* Close on ESC key */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  /* Prevent body scroll while panel is open */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  /* Open panel triggers widget open state */
  useEffect(() => {
    w.setIsOpen(true);
    return () => { w.setIsOpen(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Subtitle text */
  const subtitle =
    w.view === 'chat' && w.typingIndicator
      ? 'Agente escribiendo...'
      : w.view === 'chat' && w.activeConversation?.last_agent_response_at
        ? agentLastSeen(w.activeConversation.last_agent_response_at)
        : 'Te ayudamos con lo que necesites';

  return (
    <>
      {/* Overlay — dims everything behind the panel */}
      <div className={styles.overlay} onClick={onClose} />

      {/* Panel */}
      <div className={styles.panel} role="dialog" aria-label="Panel de soporte">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {w.view === 'chat' && (
              <button
                className={styles.backBtn}
                onClick={w.closeConversation}
                title="Volver"
              >
                {IconBack}
              </button>
            )}
            <div>
              <div className={styles.headerTitle}>
                {w.view === 'chat' ? w.activeConversation?.subject : 'Soporte'}
              </div>
              <div className={styles.headerSubtitle}>{subtitle}</div>
            </div>
          </div>

          <button className={styles.closeBtn} onClick={onClose} title="Cerrar">
            {IconClose}
          </button>
        </div>

        {/* Body — View switching */}
        <div className={styles.body}>
          {w.view === 'guest-form' && (
            <PanelGuestForm
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
            <PanelConversationList
              conversations={w.conversations}
              sending={w.sending}
              onStartChat={() => w.handleFirstMessage()}
              onSelectConversation={w.openConversation}
            />
          )}

          {w.view === 'chat' && w.activeConversation && (
            <PanelChat
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
              onClosePanel={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}

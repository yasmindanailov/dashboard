'use client';

import { RefObject } from 'react';
import type { Conversation } from '../ChatWidget/types';
import ChatThreadView, {
  type ChatThreadClasses,
} from '../../_shared/support/chat/ChatThreadView';
import styles from './SupportPanel.module.css';

/* ═══════════════════════════════════════
   PanelChat — panel sidebar (SupportPanel).
   Sprint 13.5 Fase D (DC.38): wrapper minimal sobre `<ChatThreadView>`
   shared. Mantiene su CSS module propio (SupportPanel.module.css) y
   solo mapea las clases canónicas que el shared espera.
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
  /* Sprint 16 (ADR-079 amendment A3): cerrar el panel al navegar al
     ticket escalado — UX coherente, evita panel huérfano sobre la
     página detalle del ticket. */
  onClosePanel?: () => void;
}

const panelClasses: ChatThreadClasses = {
  escalationBanner: styles.escalationBanner,
  escalationBannerLink: styles.escalationBannerLink,
  messagesScroll: styles.messages,
  typingIndicator: styles.typingIndicator,
  closedNotice: styles.closedNotice,
  systemBubble: `${styles.bubble} ${styles.bubbleSystem}`,
  inputBar: styles.inputArea,
  messageInput: styles.chatInput,
  sendButton: styles.sendBtn,
  bubbleRow: styles.bubbleWrap,
  bubbleRowMe: styles.bubbleWrapMe,
  bubbleRowOther: styles.bubbleWrapOther,
  bubbleSender: styles.senderName,
  bubbleSenderMe: styles.senderNameMe,
  bubbleSenderOther: styles.senderNameOther,
  bubbleBody: styles.bubble,
  bubbleMe: styles.bubbleMe,
  bubbleOther: styles.bubbleOther,
  // panel no usa wrapper interno separado para el text — bubbleBody envuelve directo.
  bubbleTime: styles.bubbleTime,
  bubbleTimeMe: styles.bubbleTimeMe,
  bubbleTimeOther: styles.bubbleTimeOther,
};

const SendIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function PanelChat(props: PanelChatProps) {
  return (
    <ChatThreadView
      {...props}
      classes={panelClasses}
      escalationHref={(ticketId) => `/dashboard/support/${ticketId}`}
      renderSendContent={() => <SendIcon />}
    />
  );
}

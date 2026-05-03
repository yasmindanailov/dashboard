'use client';

import { RefObject } from 'react';
import type { Conversation } from './types';
import ChatThreadView, {
  type ChatThreadClasses,
} from '../../_shared/support/chat/ChatThreadView';
import styles from './chatWidget.module.css';

/* ═══════════════════════════════════════
   ChatMessages — burbuja flotante (ChatWidget).
   Sprint 13.5 Fase D (DC.38): wrapper minimal sobre `<ChatThreadView>`
   shared. Mantiene su CSS module propio (chatWidget.module.css) y solo
   mapea las clases canónicas que el shared espera.
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

const widgetClasses: ChatThreadClasses = {
  escalationBanner: styles.escalationBanner,
  escalationBannerLink: styles.escalationBannerLink,
  messagesScroll: styles.messagesScroll,
  typingIndicator: styles.typingIndicator,
  closedNotice: styles.systemMessage,
  systemBubble: styles.systemMessage,
  inputBar: styles.inputBar,
  messageInput: styles.messageInput,
  sendButton: styles.sendButton,
  bubbleRow: styles.bubbleRow,
  bubbleRowMe: styles.bubbleRowMe,
  bubbleRowOther: styles.bubbleRowOther,
  bubbleSender: styles.bubbleSender,
  bubbleSenderMe: styles.bubbleSenderMe,
  bubbleSenderOther: styles.bubbleSenderOther,
  bubbleBody: styles.bubbleBody,
  bubbleMe: styles.bubbleMe,
  bubbleOther: styles.bubbleOther,
  bubbleText: styles.bubbleText,
  bubbleTime: styles.bubbleTime,
  bubbleTimeMe: styles.bubbleTimeMe,
  bubbleTimeOther: styles.bubbleTimeOther,
};

export default function ChatMessages(props: ChatMessagesProps) {
  return (
    <ChatThreadView
      {...props}
      classes={widgetClasses}
      escalationHref={(ticketId) => `/dashboard/support/${ticketId}`}
      renderSendContent={() => 'Enviar'}
    />
  );
}

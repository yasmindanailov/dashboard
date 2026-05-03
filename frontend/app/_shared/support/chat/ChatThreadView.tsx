'use client';

/* Sprint 13 §13.AUTH Fase E (Modelo A): componente de presentación
   puro. No accede a tokens — recibe `currentUserId` por prop desde el
   page padre (que lo obtiene del AuthContext hidratado server-side). */

import { RefObject } from 'react';
import Link from 'next/link';
import type { Conversation, Message } from '../../../components/ChatWidget/types';
import { formatTime } from '../../../components/ChatWidget/types';

/* ═══════════════════════════════════════
   ChatThreadView — Sprint 13.5 Fase D (DC.38)
   Componente shared para vista de hilo de chat (mensajes + input +
   indicador typing + banner escalación + notice cierre). Unifica el
   código que hasta Sprint 13.5 vivía duplicado en:
     · `components/ChatWidget/ChatMessages.tsx` (burbuja flotante)
     · `components/SupportPanel/PanelChat.tsx` (panel sidebar)

   Razón doctrinal de la unificación: durante Sprint 16 dos veces se
   olvidó replicar un fix entre ambos (bloqueo input chat resolved,
   banner azul `escalated_to`). Un solo origen elimina la fuente de
   bug. Cada call-site mantiene su CSS module pasando un `classes`
   mapping con las clases canónicas que el shared espera.

   El componente NO conoce paths de routing del banner — el call-site
   provee `escalationHref` (cliente: `/dashboard/support/...`,
   admin: `/admin/support/...`). El shared sólo renderiza.
   ═══════════════════════════════════════ */

export interface ChatThreadClasses {
  escalationBanner: string;
  escalationBannerLink: string;
  messagesScroll: string;
  typingIndicator: string;
  /** Notice de cierre cuando `status` es terminal (resolved/closed). */
  closedNotice: string;
  /** Bubble system message (mensajes server-side: resolved, escalated, etc.). */
  systemBubble: string;
  inputBar: string;
  messageInput: string;
  sendButton: string;
  bubbleRow: string;
  bubbleRowMe: string;
  bubbleRowOther: string;
  bubbleSender: string;
  bubbleSenderMe: string;
  bubbleSenderOther: string;
  /** Wrapper del cuerpo + tiempo (en widget no existe — usa bubbleBody directo). */
  bubbleBody: string;
  bubbleMe: string;
  bubbleOther: string;
  /** Texto del mensaje (separable del time). En el panel es interno al bubbleBody. */
  bubbleText?: string;
  bubbleTime: string;
  bubbleTimeMe: string;
  bubbleTimeOther: string;
}

export interface ChatThreadViewProps {
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
  /** Si el chat fue escalado a ticket, dónde lleva el link "Abrir ticket →". */
  escalationHref: (ticketId: string) => string;
  /** Hook opcional para cerrar el contenedor padre al navegar al ticket. */
  onClosePanel?: () => void;
  /** Render-prop para el contenido del botón Send (icono SVG o texto). */
  renderSendContent: () => React.ReactNode;
  /** Mapping de clases CSS del call-site → contrato del shared. */
  classes: ChatThreadClasses;
}

export default function ChatThreadView({
  conversation,
  isGuest,
  currentUserId,
  typingIndicator,
  message,
  sending,
  messagesEndRef,
  onMessageChange,
  onSend,
  onTyping,
  escalationHref,
  onClosePanel,
  renderSendContent,
  classes,
}: ChatThreadViewProps) {
  /* Sprint 16 (ADR-079 amendment A3): chats con estado terminal
     (`resolved` | `closed`) bloquean input + muestran notice. Si fue
     escalado a ticket, banner azul con link al ticket destino. */
  const isTerminal =
    conversation.status === 'resolved' || conversation.status === 'closed';

  return (
    <>
      {conversation.escalated_to && !isGuest && (
        <div className={classes.escalationBanner}>
          <span>
            Esta conversación se ha trasladado al ticket{' '}
            <strong>
              TK-
              {String(conversation.escalated_to.sequence_number ?? 0).padStart(
                5,
                '0',
              )}
            </strong>
            . Continúa allí.
          </span>
          <Link
            href={escalationHref(conversation.escalated_to.id)}
            className={classes.escalationBannerLink}
            onClick={() => onClosePanel?.()}
          >
            Abrir ticket →
          </Link>
        </div>
      )}

      <div className={classes.messagesScroll}>
        {conversation.messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            isMe={
              isGuest
                ? msg.sender_type === 'client'
                : msg.sender_id === currentUserId
            }
            classes={classes}
          />
        ))}

        {typingIndicator && (
          <div className={classes.typingIndicator}>Agente escribiendo...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {isTerminal ? (
        <div className={classes.closedNotice}>
          Este chat ha sido cerrado. Si necesitas seguir hablando, abre una
          nueva conversación.
        </div>
      ) : (
        <div className={classes.inputBar}>
          <input
            className={classes.messageInput}
            value={message}
            onChange={(e) => {
              onMessageChange(e.target.value);
              onTyping();
            }}
            placeholder="Escribe un mensaje..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="button"
            className={classes.sendButton}
            onClick={onSend}
            disabled={sending || !message.trim()}
          >
            {renderSendContent()}
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Private: Bubble ─── */

interface BubbleProps {
  msg: Message;
  isMe: boolean;
  classes: ChatThreadClasses;
}

function ChatBubble({ msg, isMe, classes }: BubbleProps) {
  if (msg.sender_type === 'system') {
    return <div className={classes.systemBubble}>{msg.body}</div>;
  }

  return (
    <div
      className={`${classes.bubbleRow} ${
        isMe ? classes.bubbleRowMe : classes.bubbleRowOther
      }`}
    >
      {msg.sender_name && (
        <div
          className={`${classes.bubbleSender} ${
            isMe ? classes.bubbleSenderMe : classes.bubbleSenderOther
          }`}
        >
          {isMe ? 'Tú' : msg.sender_name}
        </div>
      )}
      <div
        className={`${classes.bubbleBody} ${
          isMe ? classes.bubbleMe : classes.bubbleOther
        }`}
      >
        {classes.bubbleText ? (
          <div className={classes.bubbleText}>{msg.body}</div>
        ) : (
          <div>{msg.body}</div>
        )}
        <div
          className={`${classes.bubbleTime} ${
            isMe ? classes.bubbleTimeMe : classes.bubbleTimeOther
          }`}
        >
          {formatTime(msg.created_at)}
          {msg.read_at && ' ✓✓'}
        </div>
      </div>
    </div>
  );
}

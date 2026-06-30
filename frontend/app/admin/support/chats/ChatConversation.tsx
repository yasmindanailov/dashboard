'use client';

import { Dispatch, RefObject, SetStateAction } from 'react';
import Link from 'next/link';
import type { Chat, Message } from './types';
import { STATUS_BADGE, formatTime } from './types';
import { Button, EmptyState } from '../../../components/ui';
import { SavedRepliesPicker } from '../../../_shared/response-templates/SavedRepliesPicker';
import { AiSuggestionButton } from '../../../_shared/support/AiSuggestionButton';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   ChatConversation — Center column.

   Sprint 16 / ADR-079 §3.8: la entrada de "Nota interna" desde el input
   se eliminó. Las notas internas las generan los listeners canónicos al
   cerrar ticket / mantenimiento / task. La lectura de `msg.is_internal=
   true` de mensajes legacy permanece para auditoría.
   Ref: DECISIONS.md §43, 7.H1, 7.H13
   ═══════════════════════════════════════ */

interface ChatConversationProps {
  activeChat: Chat | null;
  currentUserId: string | undefined;
  typingIndicator: boolean;
  message: string;
  sending: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onMessageChange: Dispatch<SetStateAction<string>>;
  onSend: () => void;
  onTyping: () => void;
  onResolve: () => void;
  onEscalate: () => void;
  /** F3·E13 Fase F — hay un proveedor IA activo → muestra "Sugerencia IA". */
  aiEnabled?: boolean;
}

export default function ChatConversation({
  activeChat, currentUserId, typingIndicator,
  message, sending, messagesEndRef,
  onMessageChange, onSend, onTyping,
  onResolve, onEscalate, aiEnabled,
}: ChatConversationProps) {
  if (!activeChat) {
    return (
      <div className={styles.conversationColumn}>
        <div className={styles.conversationEmpty}>
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            title="Selecciona un chat para comenzar"
            description="Elige una conversación de la lista para ver los mensajes"
          />
        </div>
      </div>
    );
  }

  // F3·E12/E13 — inserta (macro o borrador IA) en el composer sin destruir el
  // texto en curso. Functional updater: lee el borrador MÁS RECIENTE, no el
  // snapshot del closure — clave para la IA, cuya llamada es asíncrona (segundos):
  // si el agente teclea durante la generación, no se pierde lo escrito.
  const handleInsertReply = (body: string) => {
    onMessageChange((current) => {
      const trimmed = current.replace(/\s+$/, '');
      return trimmed.length > 0 ? `${trimmed} ${body}` : body;
    });
  };

  return (
    <div className={styles.conversationColumn}>
      {/* Sprint 16 (ADR-079 amendment A3): chats sólo tienen un estado
          terminal — `resolved`. Botón "Cerrar" eliminado (no aplica al
          chat). Cuando el chat ya está `resolved`, ocultamos también
          Resolver/Escalar — estado inmutable. */}
      <div className={styles.conversationHeader}>
        <div className={styles.conversationHeaderInfo}>
          <h3>{activeChat.subject}</h3>
          <div className={styles.conversationStatus}>
            {typingIndicator ? 'Cliente escribiendo...' : STATUS_BADGE[activeChat.status]?.label || activeChat.status}
          </div>
        </div>
        {activeChat.status !== 'resolved' && activeChat.status !== 'closed' && (
          <div className={styles.conversationHeaderActions}>
            <Button variant="secondary" size="sm" onClick={onResolve} title="Marcar como resuelto">
              Resolver
            </Button>
            <Button variant="ghost" size="sm" onClick={onEscalate} title="Escalar a ticket">
              Escalar a ticket
            </Button>
          </div>
        )}
      </div>

      {/* Sprint 16 (ADR-079 amendment A3): banner cuando el chat fue
          escalado a ticket. Link directo al ticket destino. */}
      {activeChat.escalated_to && (
        <div className={styles.escalationBanner}>
          <span>
            Esta conversación se escaló al ticket{' '}
            <strong>
              TK-
              {String(activeChat.escalated_to.sequence_number ?? 0).padStart(5, '0')}
            </strong>
            . El seguimiento continúa en el ticket.
          </span>
          <Link
            href={`/admin/support/${activeChat.escalated_to.id}`}
            className={styles.escalationBannerLink}
          >
            Abrir ticket →
          </Link>
        </div>
      )}

      {/* Messages */}
      <div className={styles.messagesArea}>
        {activeChat.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isMe={msg.sender_id === currentUserId} />
        ))}

        {typingIndicator && (
          <div className={styles.typingIndicator}>
            Cliente escribiendo...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — sólo cuando el chat está vivo. ADR-079 A3: chat resolved
          es terminal, ambos lados ven notice y no pueden escribir. */}
      {activeChat.status === 'resolved' || activeChat.status === 'closed' ? (
        <div className={styles.closedNotice ?? styles.inputArea}>
          Este chat ha sido cerrado. Si necesitas seguir hablando, abre una nueva conversación.
        </div>
      ) : (
        <div className={styles.inputArea}>
          {/* F3·E12 — respuestas guardadas (macros) + F3·E13 — sugerencia IA.
              Ambas insertan en el borrador de forma no-destructiva (`handleInsertReply`). */}
          <div className={styles.composerTools}>
            <SavedRepliesPicker onInsert={handleInsertReply} />
            {aiEnabled && activeChat && (
              <AiSuggestionButton
                conversationId={activeChat.id}
                onInsert={handleInsertReply}
                disabled={sending}
              />
            )}
          </div>
          <div className={styles.inputRow}>
            <input
              value={message}
              onChange={(e) => { onMessageChange(e.target.value); onTyping(); }}
              placeholder="Escribe un mensaje al cliente..."
              className={styles.messageInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
              }}
            />
            <button
              onClick={onSend}
              disabled={sending || !message.trim()}
              className={styles.sendButton}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Message Bubble (private sub-component) ─── */

function MessageBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const isSystem = msg.sender_type === 'system';
  // Lectura legacy: mensajes anteriores a Sprint 16 con `is_internal=true`
  // mantienen su rendering como "nota interna (legacy)" en el historial
  // (auditoría inmutable). Los nuevos mensajes nunca marcan is_internal.
  const isInternal = msg.is_internal;

  if (isSystem) {
    return <div className={styles.systemMessage}>{msg.body}</div>;
  }

  const senderClass = isInternal
    ? styles.messageSenderInternal
    : isMe
      ? styles.messageSenderAgent
      : styles.messageSenderClient;

  const bubbleClass = isInternal
    ? styles.bubbleInternal
    : isMe
      ? styles.bubbleAgent
      : styles.bubbleClient;

  const metaClass = isInternal
    ? styles.bubbleMetaInternal
    : isMe
      ? styles.bubbleMetaAgent
      : styles.bubbleMetaClient;

  return (
    <div className={`${styles.messageWrapper} ${isMe ? styles.messageAlignRight : styles.messageAlignLeft}`}>
      {/* 7.H13: Sender name */}
      {msg.sender_name && (
        <div className={`${styles.messageSender} ${senderClass}`}>
          {msg.sender_name}
        </div>
      )}
      <div className={`${styles.bubble} ${bubbleClass}`}>
        {isInternal && <div className={styles.bubbleInternalLabel}>Nota interna (legacy)</div>}
        <div className={styles.bubbleBody}>{msg.body}</div>
        <div className={`${styles.bubbleMeta} ${metaClass}`}>
          {formatTime(msg.created_at)}
          {msg.read_at && <span className={styles.readReceipt}>✓✓</span>}
        </div>
      </div>
    </div>
  );
}

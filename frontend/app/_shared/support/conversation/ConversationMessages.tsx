'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DetailMessage } from './types';
import { formatDate } from './types';
import { Button } from '../../../components/ui';
import { AiSuggestionButton } from '../AiSuggestionButton';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   ConversationMessages — Message list + input.

   Sprint 16 / ADR-079 §3.8: la entrada manual de "Nota interna" desde el
   input de mensajes se eliminó. Las notas internas las generan
   exclusivamente los listeners canónicos al cerrar ticket / mantenimiento /
   task. Para apuntes libres del agente sobre el cliente existe la nota
   excepcional desde `/admin/clients/[id]?tab=notas`.

   La lectura de `msg.is_internal=true` permanece para mensajes legacy en
   el historial — auditoría inmutable.
   ═══════════════════════════════════════ */

/**
 * Sprint 16 (ADR-079 amendments A1+A3): `lockReason` controla la
 * visibilidad y el copy del aviso cuando el input está bloqueado:
 *   - `closed`          → ticket archivado, nadie escribe.
 *   - `resolved_agent`  → ticket resuelto, el agente debe pulsar "Reabrir"
 *                         para volver a actuar (vía canónica que crea
 *                         nueva task bridge). El cliente sí puede escribir
 *                         (su respuesta reactiva el ticket).
 *   - `chat_resolved`   → chat resuelto (estado terminal único del chat).
 *                         Inmutable para ambos lados: si el cliente
 *                         necesita continuar, abre nueva conversación.
 *   - `null`            → input visible y editable.
 */
type ConversationLockReason =
  | 'closed'
  | 'resolved_agent'
  | 'chat_resolved'
  | null;

interface ConversationMessagesProps {
  messages: DetailMessage[];
  /** Bloqueo del input + notice. Reemplaza al anterior `isClosed` boolean
      con semántica explícita por contexto del viewer. */
  lockReason: ConversationLockReason;
  currentUserId?: string;
  newMessage: string;
  sending: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onMessageChange: Dispatch<SetStateAction<string>>;
  onSend: () => void;
  /** F3·E13 Fase F — staff con proveedor IA activo → muestra "Sugerencia IA". */
  aiEnabled?: boolean;
  conversationId?: string;
}

const LOCK_NOTICES: Record<Exclude<ConversationLockReason, null>, string> = {
  closed: 'Esta conversación está cerrada.',
  resolved_agent:
    'Este ticket está resuelto. Pulsa "Reabrir" en la cabecera para volver a actuar.',
  chat_resolved:
    'Este chat ha sido cerrado. Si necesitas seguir hablando, abre una nueva conversación.',
};

export default function ConversationMessages({
  messages, lockReason, currentUserId,
  newMessage, sending, messagesEndRef,
  onMessageChange, onSend,
  aiEnabled, conversationId,
}: ConversationMessagesProps) {
  // F3·E13 — inserta el borrador de IA sin destruir el texto en curso.
  // Functional updater: lee el borrador MÁS RECIENTE (no el snapshot del
  // closure) — clave porque la generación IA es asíncrona (segundos): si el
  // agente teclea durante la espera, no se pierde lo escrito.
  const handleInsertReply = (body: string) => {
    onMessageChange((current) => {
      const trimmed = current.replace(/\s+$/, '');
      return trimmed.length > 0 ? `${trimmed} ${body}` : body;
    });
  };
  return (
    <div className={styles.messagesContainer}>
      {/* Message list */}
      <div className={styles.messagesList}>
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          const isSystem = msg.sender_type === 'system';
          const isAgent = msg.sender_type === 'agent';

          if (isSystem) {
            return (
              <div key={msg.id} className={styles.systemMessage}>
                {msg.body} · {formatDate(msg.created_at)}
              </div>
            );
          }

          // Lectura legacy: mensajes anteriores a Sprint 16 con
          // `is_internal=true` mantienen su rendering como nota interna
          // dentro del historial (auditoría). Los nuevos mensajes nunca
          // marcan `is_internal=true`.
          const bubbleClass = msg.is_internal
            ? styles.bubbleInternal
            : isMe
              ? styles.bubbleMine
              : styles.bubbleTheirs;

          const senderClass = msg.is_internal
            ? styles.bubbleSenderInternal
            : isMe
              ? styles.bubbleSenderMine
              : styles.bubbleSenderTheirs;

          const timeClass = isMe
            ? styles.bubbleTimeMine
            : styles.bubbleTimeTheirs;

          let senderLabel = '';
          if (msg.is_internal) senderLabel = 'Nota interna (legacy)';
          else if (isMe) senderLabel = 'Tú';
          else if (isAgent) senderLabel = 'Agente';
          else if (msg.sender_type === 'client') senderLabel = 'Cliente';

          return (
            <div key={msg.id} className={`${styles.bubbleWrap} ${isMe ? styles.bubbleWrapMine : styles.bubbleWrapTheirs}`}>
              <div className={`${styles.bubble} ${bubbleClass}`}>
                <div className={`${styles.bubbleSender} ${senderClass}`}>
                  {senderLabel}
                </div>
                <div>{msg.body}</div>
                <div className={`${styles.bubbleTime} ${timeClass}`}>
                  {formatDate(msg.created_at)}
                  {msg.read_at && ' ✓✓'}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input público al cliente — visible solo si no hay lockReason. */}
      {!lockReason && (
        <div className={styles.inputArea}>
          {/* F3·E13 Fase F — botón Sugerencia IA (solo staff con IA activa). */}
          {aiEnabled && conversationId && (
            <div className={styles.composerTools}>
              <AiSuggestionButton
                conversationId={conversationId}
                onInsert={handleInsertReply}
                disabled={sending}
              />
            </div>
          )}
          <div className={styles.inputRow}>
            <textarea
              value={newMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Escribe tu mensaje..."
              rows={2}
              className={styles.messageTextarea}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <Button
              onClick={onSend}
              disabled={sending || !newMessage.trim()}
              loading={sending}
              size="sm"
            >
              Enviar
            </Button>
          </div>
        </div>
      )}

      {/* Notice contextual cuando el input está bloqueado. */}
      {lockReason && (
        <div className={styles.closedNotice}>{LOCK_NOTICES[lockReason]}</div>
      )}
    </div>
  );
}

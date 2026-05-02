'use client';

import Link from 'next/link';
import type { ConversationDetail } from './types';
import { STATUS_CONFIG, PRIORITY_OPTIONS, CATEGORY_LABELS, formatDate } from './types';
import { Badge, Select, Button, Tooltip } from '../../../components/ui';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   ConversationHeader — Title, badges, actions
   DS components: Badge, Select, Button
   Ref: UI_SPEC §2.5, ROADMAP.md D25
   ═══════════════════════════════════════ */

interface LinkedTaskHint {
  id: string;
  status: string;
}

interface ConversationHeaderProps {
  conversation: ConversationDetail;
  isAdmin: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onEscalateToTicket: () => void;
  /**
   * Sprint 8 Fase B.10 (2026-04-30) — ADR-074. Si la conversación tiene
   * una task activa vinculada (`status in pending|in_progress`), oculta
   * los botones Resolver/Cerrar y muestra un link a la task. El cierre
   * canónico se hace desde la task, sin duplicar acciones ni notas.
   */
  linkedTask?: LinkedTaskHint | null;
}

export default function ConversationHeader({
  conversation, isAdmin, onStatusChange, onPriorityChange, onEscalateToTicket,
  linkedTask,
}: ConversationHeaderProps) {
  const status = STATUS_CONFIG[conversation.status] || STATUS_CONFIG.open;
  const isChat = conversation.type === 'chat';
  const isTicket = conversation.type === 'ticket';

  return (
    <div className={styles.headerRow}>
      <div>
        <h1 className={styles.headerTitle}>{conversation.subject}</h1>
        <div className={styles.headerMeta}>
          {/* Type badge */}
          <Badge variant={isChat ? 'brand' : 'neutral'}>
            {isChat ? 'Chat' : 'Ticket'}
          </Badge>
          {/* Status */}
          <Badge variant={status.variant}>{status.label}</Badge>
          {/* Sub-fase 8.D.12.6 — Support Inside del cliente.
              Si el cliente tiene plan SI activo, mostramos el badge
              tier+SLA al lado del status para que el agente entienda
              de un vistazo la prioridad esperada. Tooltip con canales
              activos. Brand para llamar la atención sin interferir
              con el flujo de status/category. */}
          {conversation.client_support_inside && isAdmin && (
            <Tooltip
              content={`SLA respuesta ${conversation.client_support_inside.response_sla_hours}h · Canales: ${conversation.client_support_inside.channels_active.join(', ')}`}
            >
              <Link
                href={`/admin/support-inside-plans/${conversation.client_support_inside.product_slug}`}
                style={{ textDecoration: 'none' }}
              >
                <Badge variant="brand">
                  {conversation.client_support_inside.product_name} · SLA {conversation.client_support_inside.response_sla_hours}h
                </Badge>
              </Link>
            </Tooltip>
          )}
          {/* Category */}
          {isTicket && conversation.category && conversation.category !== 'escalated_chat' && (
            <Badge variant="neutral">
              {CATEGORY_LABELS[conversation.category] || conversation.category}
            </Badge>
          )}
          {/* Escalation link */}
          {conversation.escalated_from_id && (
            <Link href={`/dashboard/support/${conversation.escalated_from_id}`} className={styles.escalationLink}>
              Escalado desde chat
            </Link>
          )}
          <span className={styles.headerMetaText}>Canal: {conversation.channel}</span>
          <span className={styles.headerMetaText}>Creada: {formatDate(conversation.created_at)}</span>
        </div>
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className={styles.headerActions}>
          <Select
            value={conversation.priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            options={PRIORITY_OPTIONS}
            size="sm"
          />

          {/* Sprint 16 / ADR-079 §3.6.1: cuando hay task bridge activa
              vinculada, ocultamos Resolver/Cerrar — el cierre canónico
              vive en la task. Cuando el ticket está `resolved` o
              `closed` (estados terminales tras completar la task),
              mostramos `Reabrir` para reactivar. `closed` además bloquea
              el input de mensajes en backend; `resolved` permite escribir
              (cliente puede responder y eso lo devuelve a `waiting_agent`).
              Sprint 8 Fase B.10 — ADR-074: el flujo de cierre de bridge
              es la task; aquí solo garantizamos que el ticket no queda
              huérfano sin acción de reapertura. */}
          {linkedTask ? (
            <Link
              href={`/admin/tasks?focus=${linkedTask.id}`}
              className={styles.linkedTaskPill}
            >
              Trabajando en tarea →
            </Link>
          ) : (
            <>
              {/* Sprint 16 (ADR-079 amendment A3): asimetría de lifecycle
                  entre tickets y chats.
                  - Tickets: Resolver / Cerrar (vivo) · Reabrir (terminal).
                  - Chats: SOLO Resolver / Escalar (vivo). Sin "Cerrar" (no
                    aplica) ni "Reabrir" (un chat resuelto es terminal
                    inmutable; el cliente abre nueva conversación). */}
              {isTicket &&
                conversation.status !== 'closed' &&
                conversation.status !== 'resolved' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onStatusChange('resolved')}
                    >
                      Resolver
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onStatusChange('closed')}
                    >
                      Cerrar
                    </Button>
                  </>
                )}
              {isTicket &&
                (conversation.status === 'resolved' ||
                  conversation.status === 'closed') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onStatusChange('open')}
                  >
                    Reabrir
                  </Button>
                )}
              {isChat && conversation.status !== 'resolved' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onStatusChange('resolved')}
                  >
                    Resolver
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onEscalateToTicket}
                  >
                    Escalar a ticket
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

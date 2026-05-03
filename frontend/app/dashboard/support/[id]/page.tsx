'use client';

// TODO(ADR-078, Sprint 13): migrar a Server Component cuando cierre §13.AUTH.

import { useState } from 'react';
import Link from 'next/link';
import { useConversationDetail } from '../../../_shared/support/conversation/useConversationDetail';
import ConversationHeader from '../../../_shared/support/conversation/ConversationHeader';
import ConversationMessages from '../../../_shared/support/conversation/ConversationMessages';
import {
  DetailPage,
  Card,
  Skeleton,
  Button,
  Modal,
  useToast,
} from '../../../components/ui';
import { supportApi } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import styles from '../../../_shared/support/conversation/conversationDetail.module.css';

/* ═══════════════════════════════════════
   Client Conversation Detail — Portal de Cliente.

   Sprint 16 (ADR-079 amendment): cuando el ticket está en `resolved`,
   mostramos un banner explicativo + dos opciones al cliente:
     - **Confirmar resolución** → cierra el ticket explícito (`→closed`).
     - **Responder en el ticket** (escribir mensaje en el input) →
       reactiva el ticket (`→waiting_agent`) y se genera nueva tarea.

   Si el cliente no hace nada en N días, el cron `support-resolved-auto-close`
   lo cierra silenciosamente.
   Ref: UI_SPEC §2.5, ADR-066, ADR-067, ADR-079.
   ═══════════════════════════════════════ */

export default function ClientConversationDetailPage() {
  const d = useConversationDetail();
  const { toast } = useToast();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const getDetailDisplayTitle = (conv: {
    sequence_number?: number | null;
    subject: string;
    type: string;
  }) => {
    if (conv.type === 'ticket' && conv.sequence_number) {
      return `TK-${String(conv.sequence_number).padStart(5, '0')} · ${conv.subject}`;
    }
    return conv.subject;
  };

  const handleConfirmResolution = async () => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
    if (!token || !d.conversationId) return;
    setConfirming(true);
    try {
      await supportApi.confirmResolution(token, d.conversationId);
      toast('success', 'Ticket cerrado. ¡Gracias por confirmar!');
      setShowConfirmModal(false);
      // Recargamos el detalle para reflejar el nuevo estado.
      window.location.reload();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'No se pudo confirmar la resolución');
    } finally {
      setConfirming(false);
    }
  };

  if (d.loading) {
    return (
      <DetailPage
        breadcrumb={[
          { label: 'Soporte', href: '/dashboard/support' },
          { label: 'Cargando...' },
        ]}
        header={
          <div>
            <Skeleton width="50%" height={24} />
            <div className={styles.skeletonBadges}>
              <Skeleton width={60} height={20} />
              <Skeleton width={80} height={20} />
            </div>
          </div>
        }
      >
        <Card>
          <div className={styles.skeletonPadLg}>
            <Skeleton width="70%" height={14} />
            <div className={styles.skeletonLine}>
              <Skeleton width="90%" height={14} />
            </div>
            <div className={styles.skeletonLine}>
              <Skeleton width="50%" height={14} />
            </div>
            <div className={styles.skeletonLine}>
              <Skeleton width="80%" height={14} />
            </div>
          </div>
        </Card>
      </DetailPage>
    );
  }

  if (!d.conversation) {
    return (
      <DetailPage
        breadcrumb={[
          { label: 'Soporte', href: '/dashboard/support' },
          { label: 'No encontrada' },
        ]}
        header={
          <div className={styles.notFoundContainer}>
            <div className={styles.notFoundTitle}>Conversación no encontrada</div>
            <Link href="/dashboard/support" className={styles.notFoundLink}>
              ← Volver a soporte
            </Link>
          </div>
        }
      >
        <></>
      </DetailPage>
    );
  }

  const isClosed = d.conversation.status === 'closed';
  const isResolved =
    d.conversation.status === 'resolved' && d.conversation.type === 'ticket';

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Soporte', href: '/dashboard/support' },
        { label: getDetailDisplayTitle(d.conversation) },
      ]}
      header={
        <ConversationHeader
          conversation={d.conversation}
          isAdmin={false}
          onStatusChange={d.handleStatusChange}
          onPriorityChange={d.handlePriorityChange}
          onEscalateToTicket={d.handleEscalateToTicket}
        />
      }
    >
      {isResolved && (
        <div className={styles.resolvedBanner}>
          <div className={styles.resolvedBannerBody}>
            <strong>El equipo Aelium ha marcado este ticket como resuelto.</strong>
            <p>
              ¿Quedó solucionado tu problema? Confirma la resolución para
              cerrar el ticket. Si necesitas seguir hablando, escribe abajo —
              el ticket se reabrirá automáticamente y un agente lo retomará.
              Si no respondes en 7 días, lo cerraremos por inactividad.
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowConfirmModal(true)}
          >
            Confirmar resolución
          </Button>
        </div>
      )}

      {/* Sprint 16 (ADR-079 amendment A3): banner cuando el chat fue
          escalado a ticket. Link directo al ticket destino del cliente. */}
      {d.conversation.escalated_to && (
        <div className={styles.escalationBanner}>
          <span>
            Esta conversación se ha trasladado al ticket{' '}
            <strong>
              TK-
              {String(d.conversation.escalated_to.sequence_number ?? 0).padStart(
                5,
                '0',
              )}
            </strong>
            . Continúa la conversación allí.
          </span>
          <Link
            href={`/dashboard/support/${d.conversation.escalated_to.id}`}
            className={styles.escalationBannerLink}
          >
            Abrir ticket →
          </Link>
        </div>
      )}

      {/* Cliente: bloqueo según tipo y estado (Sprint 16 / ADR-079 A1+A3).
          - Ticket `closed` → bloqueado para todos.
          - Ticket `resolved` → cliente SÍ puede escribir (su respuesta
            reactiva el ticket vía `conversation.reactivated`).
          - Chat `resolved` → bloqueado (terminal absoluto del chat;
            cliente abre nueva conversación si necesita continuar). */}
      <ConversationMessages
        messages={d.conversation.messages}
        lockReason={
          isClosed
            ? 'closed'
            : d.conversation.status === 'resolved' &&
                d.conversation.type === 'chat'
              ? 'chat_resolved'
              : null
        }
        currentUserId={d.user?.id}
        newMessage={d.newMessage}
        sending={d.sending}
        messagesEndRef={d.messagesEndRef}
        onMessageChange={d.setNewMessage}
        onSend={d.handleSendMessage}
      />

      <Modal
        open={showConfirmModal}
        onClose={() => (confirming ? undefined : setShowConfirmModal(false))}
        title="Confirmar resolución del ticket"
        size="sm"
      >
        <p className={styles.completionDesc ?? undefined}>
          Al confirmar, el ticket pasará a estado <strong>cerrado</strong> y
          quedará archivado. Si necesitas reactivarlo más adelante, contáctanos
          desde un nuevo ticket.
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-4)',
          }}
        >
          <Button
            variant="secondary"
            onClick={() => setShowConfirmModal(false)}
            disabled={confirming}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmResolution}
            loading={confirming}
            disabled={confirming}
          >
            Sí, confirmar resolución
          </Button>
        </div>
      </Modal>
    </DetailPage>
  );
}

'use client';

import Link from 'next/link';
import { useConversationDetail } from '../../../_shared/support/conversation/useConversationDetail';
import ConversationHeader from '../../../_shared/support/conversation/ConversationHeader';
import ConversationMessages from '../../../_shared/support/conversation/ConversationMessages';
import { DetailPage, Card, Skeleton } from '../../../components/ui';
import styles from '../../../_shared/support/conversation/conversationDetail.module.css';

/* ═══════════════════════════════════════
   Client Conversation Detail — Portal de Cliente (ADR-066 Fase E.3)
   UX simplificada:
     - Sin sidebar de contexto cliente (el cliente NO ve datos del
       cliente "él mismo" en una sidebar — es redundante).
     - Sin toggle `is_internal` en respuestas (no aplica para cliente).
     - Sin cambio de status / priority / escalate (sólo el equipo los
       maneja). El header recibe `isAdmin=false` y el componente neutro
       desactiva esas controles automáticamente.
     - Sin redirect a chat panel (`/admin/support/chats` es staff-only;
       el cliente ve sus chats aquí mismo en formato hilo).
   Audiencia: rol `client` (CASL `Read.Conversation` con ownership).
   El staff tiene `/admin/support/[id]` (full UX con sidebar + acciones).
   Ref: UI_SPEC §2.5, ADR-066, ADR-067, DECISIONS.md §43, §46
   ═══════════════════════════════════════ */

export default function ClientConversationDetailPage() {
  const d = useConversationDetail();

  const getDetailDisplayTitle = (conv: { sequence_number?: number | null; subject: string; type: string }) => {
    if (conv.type === 'ticket' && conv.sequence_number) {
      return `TK-${String(conv.sequence_number).padStart(5, '0')} · ${conv.subject}`;
    }
    return conv.subject;
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
            <div className={styles.skeletonLine}><Skeleton width="90%" height={14} /></div>
            <div className={styles.skeletonLine}><Skeleton width="50%" height={14} /></div>
            <div className={styles.skeletonLine}><Skeleton width="80%" height={14} /></div>
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
            <Link href="/dashboard/support" className={styles.notFoundLink}>← Volver a soporte</Link>
          </div>
        }
      >
        <></>
      </DetailPage>
    );
  }

  const isClosed = d.conversation.status === 'closed';

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
      {/* Cliente: una sola columna con la conversación. Sin sidebar contexto. */}
      <ConversationMessages
        messages={d.conversation.messages}
        isClosed={isClosed}
        isAdmin={false}
        currentUserId={d.user?.id}
        newMessage={d.newMessage}
        isInternal={false}
        sending={d.sending}
        messagesEndRef={d.messagesEndRef}
        onMessageChange={d.setNewMessage}
        onInternalChange={() => {}}
        onSend={d.handleSendMessage}
      />
    </DetailPage>
  );
}

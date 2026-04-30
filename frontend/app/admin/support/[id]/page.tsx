'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConversationDetail } from '../../../_shared/support/conversation/useConversationDetail';
import ConversationHeader from '../../../_shared/support/conversation/ConversationHeader';
import ConversationMessages from '../../../_shared/support/conversation/ConversationMessages';
import ConversationSidebar from '../../../_shared/support/conversation/ConversationSidebar';
import DetailResolutionModal from '../../../_shared/support/conversation/DetailResolutionModal';
import { DetailPage, Card, Skeleton } from '../../../components/ui';
import styles from '../../../_shared/support/conversation/conversationDetail.module.css';
import { tasksApi } from '../../../lib/api';

/* ═══════════════════════════════════════
   Admin Conversation Detail — Portal de Administración
   (ADR-066 Fase E.3)
   Full UX staff: sidebar contexto cliente (datos personales, servicios,
   últimas notas) + toggle is_internal en respuestas + cambios de
   status / priority + escalación chat→ticket.

   Si la conversación es tipo `chat` y el caller es agente, redirige
   automáticamente al panel en vivo `/admin/support/chats?open=:id`
   para usar la WS real-time. Las conversaciones tipo `ticket` se
   gestionan en esta misma página.

   Audiencia: superadmin / agent_full / agent_support (CASL Manage
   Conversation). agent_billing recibe 403 backend.
   El cliente tiene `/dashboard/support/[id]` (read-only sin sidebar).
   Ref: UI_SPEC §2.5, ADR-066, ADR-067, DECISIONS.md §43, §46, 7.H17
   ═══════════════════════════════════════ */

interface LinkedTaskHint {
  id: string;
  status: string;
  title: string;
}

export default function AdminConversationDetailPage() {
  const d = useConversationDetail();
  const router = useRouter();
  const isChat = d.conversation?.type === 'chat';
  // Sprint 8 Fase B.10 (2026-04-30) — ADR-074: detectar task vinculada
  // activa para ocultar Resolver/Cerrar y delegar el cierre a la task.
  const [linkedTask, setLinkedTask] = useState<LinkedTaskHint | null>(null);

  /* Chat → workspace en vivo. Tickets se quedan aquí. */
  useEffect(() => {
    if (d.conversation && d.conversation.type === 'chat') {
      router.replace(`/admin/support/chats?open=${d.conversation.id}`);
    }
  }, [d.conversation, router]);

  // Carga lazy de la task vinculada (un row máximo). El backend filtra
  // por `conversation_id` y devuelve solo activas (pending|in_progress)
  // si el ticket tiene una bridge en curso. Si no hay, queda en null.
  useEffect(() => {
    const conv = d.conversation;
    if (!conv || conv.type !== 'ticket') return;
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('access_token') || ''
        : '';
    if (!token) return;
    void (async () => {
      try {
        const res = (await tasksApi.list(token, {
          conversation_id: conv.id,
          status: 'pending',
          scope: 'all',
          limit: 1,
        })) as { data?: { id: string; status: string; title: string }[] };
        const data = res?.data ?? [];
        // Si la primera está pending, perfecto. Si no, probamos in_progress.
        if (data.length > 0) {
          setLinkedTask({ id: data[0].id, status: data[0].status, title: data[0].title });
          return;
        }
        const res2 = (await tasksApi.list(token, {
          conversation_id: conv.id,
          status: 'in_progress',
          scope: 'all',
          limit: 1,
        })) as { data?: { id: string; status: string; title: string }[] };
        const data2 = res2?.data ?? [];
        setLinkedTask(
          data2.length > 0
            ? { id: data2[0].id, status: data2[0].status, title: data2[0].title }
            : null,
        );
      } catch {
        setLinkedTask(null);
      }
    })();
  }, [d.conversation]);

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
          { label: 'Soporte', href: '/admin/support' },
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
        <div className={styles.twoColumn}>
          <div className={styles.mainCol}>
            <Card>
              <div className={styles.skeletonPadLg}>
                <Skeleton width="70%" height={14} />
                <div className={styles.skeletonLine}><Skeleton width="90%" height={14} /></div>
                <div className={styles.skeletonLine}><Skeleton width="50%" height={14} /></div>
                <div className={styles.skeletonLine}><Skeleton width="80%" height={14} /></div>
              </div>
            </Card>
          </div>
          <div className={styles.sideCol}>
            <Card>
              <div className={styles.skeletonPadSm}>
                <Skeleton width="60%" height={16} />
                <div className={styles.skeletonLineSmall}><Skeleton width="100%" height={14} /></div>
                <div className={styles.skeletonLineTiny}><Skeleton width="80%" height={14} /></div>
              </div>
            </Card>
          </div>
        </div>
      </DetailPage>
    );
  }

  if (!d.conversation) {
    return (
      <DetailPage
        breadcrumb={[
          { label: 'Soporte', href: '/admin/support' },
          { label: 'No encontrada' },
        ]}
        header={
          <div className={styles.notFoundContainer}>
            <div className={styles.notFoundTitle}>Conversación no encontrada</div>
            <Link href="/admin/support" className={styles.notFoundLink}>← Volver a soporte</Link>
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
        { label: isChat ? 'Chats' : 'Soporte', href: isChat ? '/admin/support/chats' : '/admin/support' },
        { label: getDetailDisplayTitle(d.conversation) },
      ]}
      header={
        <ConversationHeader
          conversation={d.conversation}
          isAdmin={true}
          onStatusChange={d.handleStatusChange}
          onPriorityChange={d.handlePriorityChange}
          onEscalateToTicket={d.handleEscalateToTicket}
          linkedTask={linkedTask}
        />
      }
      wide
    >
      <div className={styles.twoColumn}>
        {/* Left: Conversation messages (con toggle is_internal) */}
        <div className={styles.mainCol}>
          <ConversationMessages
            messages={d.conversation.messages}
            isClosed={isClosed}
            isAdmin={true}
            currentUserId={d.user?.id}
            newMessage={d.newMessage}
            isInternal={d.isInternal}
            sending={d.sending}
            messagesEndRef={d.messagesEndRef}
            onMessageChange={d.setNewMessage}
            onInternalChange={d.setIsInternal}
            onSend={d.handleSendMessage}
          />
        </div>

        {/* Right: Client context sidebar */}
        <div className={styles.sideCol}>
          <ConversationSidebar
            isAdmin={true}
            conversation={d.conversation}
            clientContext={d.clientContext}
            clientNotes={d.clientNotes}
            clientServices={d.clientServices}
            contextLoading={d.contextLoading}
            isChat={isChat}
          />
        </div>
      </div>

      {d.resolutionModal && (
        <DetailResolutionModal
          type={d.resolutionModal.type}
          note={d.resolutionNote}
          loading={d.resolutionLoading}
          onNoteChange={d.setResolutionNote}
          onSubmit={d.submitResolution}
          onClose={d.closeResolutionModal}
        />
      )}
    </DetailPage>
  );
}

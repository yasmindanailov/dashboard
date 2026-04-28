'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConversationDetail } from '../../../_shared/support/conversation/useConversationDetail';
import ConversationHeader from '../../../_shared/support/conversation/ConversationHeader';
import ConversationMessages from '../../../_shared/support/conversation/ConversationMessages';
import ConversationSidebar from '../../../_shared/support/conversation/ConversationSidebar';
import DetailResolutionModal from '../../../_shared/support/conversation/DetailResolutionModal';
import { DetailPage, Card, Skeleton } from '../../../components/ui';
import styles from '../../../_shared/support/conversation/conversationDetail.module.css';

/* ═══════════════════════════════════════
   Conversation Detail Page — Orchestrator
   Layout: DetailPage (§2.5)
   Breadcrumb: Soporte > [Subject]
   2-column: messages + client context sidebar

   Redirect: If the conversation is a chat AND the user is
   an agent, redirect to the live chat panel (/support/chats)
   so they get the real-time WebSocket experience.
   Clients always stay on this page (no access to agent panel).
   Ref: UI_SPEC §2.5, ROADMAP.md D25
   ═══════════════════════════════════════ */

export default function ConversationDetailPage() {
  const d = useConversationDetail();
  const router = useRouter();
  const isChat = d.conversation?.type === 'chat';

  /* Redirect agents to the chat panel for chat-type conversations */
  useEffect(() => {
    if (d.conversation && d.conversation.type === 'chat' && d.isAdmin) {
      router.replace(`/admin/support/chats?open=${d.conversation.id}`);
    }
  }, [d.conversation, d.isAdmin, router]);

  /** Build a display title for tickets: TK-00042 · Subject */
  const getDetailDisplayTitle = (conv: { sequence_number?: number | null; subject: string; type: string }) => {
    if (conv.type === 'ticket' && conv.sequence_number) {
      return `TK-${String(conv.sequence_number).padStart(5, '0')} · ${conv.subject}`;
    }
    return conv.subject;
  };

  // Loading state with Skeleton (§4.4)
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

  // Not found
  if (!d.conversation) {
    return (
      <DetailPage
        breadcrumb={[
          { label: 'Soporte', href: '/dashboard/support' },
          { label: 'No encontrada' },
        ]}
        header={
          <div className={styles.notFoundContainer}>
            <div className={styles.notFoundTitle}>
              Conversación no encontrada
            </div>
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

  return (
    <DetailPage
      breadcrumb={[
        { label: isChat ? 'Chats' : 'Soporte', href: isChat ? '/admin/support/chats' : '/dashboard/support' },
        { label: getDetailDisplayTitle(d.conversation) },
      ]}
      header={
        <ConversationHeader
          conversation={d.conversation}
          isAdmin={d.isAdmin}
          onStatusChange={d.handleStatusChange}
          onPriorityChange={d.handlePriorityChange}
          onEscalateToTicket={d.handleEscalateToTicket}
        />
      }
      wide
    >
      <div className={styles.twoColumn}>
        {/* Left: Conversation messages */}
        <div className={styles.mainCol}>
          <ConversationMessages
            messages={d.conversation.messages}
            isClosed={isClosed}
            isAdmin={d.isAdmin}
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

        {/* Right: Client context */}
        <div className={styles.sideCol}>
          <ConversationSidebar
            isAdmin={d.isAdmin}
            conversation={d.conversation}
            clientContext={d.clientContext}
            clientNotes={d.clientNotes}
            clientServices={d.clientServices}
            contextLoading={d.contextLoading}
            isChat={isChat}
          />
        </div>
      </div>

      {/* Resolution modal */}
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

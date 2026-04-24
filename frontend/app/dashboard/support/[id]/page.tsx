'use client';

import Link from 'next/link';
import { useConversationDetail } from './useConversationDetail';
import ConversationHeader from './ConversationHeader';
import ConversationMessages from './ConversationMessages';
import ConversationSidebar from './ConversationSidebar';
import DetailResolutionModal from './DetailResolutionModal';
import { DetailPage, Card, Skeleton } from '../../../components/ui';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   Conversation Detail Page — Orchestrator
   Layout: DetailPage (§2.5)
   Breadcrumb: Soporte > [Subject]
   2-column: messages + client context sidebar
   Ref: UI_SPEC §2.5, ROADMAP.md D25
   ═══════════════════════════════════════ */

export default function ConversationDetailPage() {
  const d = useConversationDetail();
  const isChat = d.conversation?.type === 'chat';

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
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Skeleton width={60} height={20} />
              <Skeleton width={80} height={20} />
            </div>
          </div>
        }
      >
        <div className={styles.twoColumn}>
          <div className={styles.mainCol}>
            <Card>
              <div style={{ padding: 'var(--space-6)' }}>
                <Skeleton width="70%" height={14} />
                <div style={{ marginTop: 16 }}><Skeleton width="90%" height={14} /></div>
                <div style={{ marginTop: 16 }}><Skeleton width="50%" height={14} /></div>
                <div style={{ marginTop: 16 }}><Skeleton width="80%" height={14} /></div>
              </div>
            </Card>
          </div>
          <div className={styles.sideCol}>
            <Card>
              <div style={{ padding: 'var(--space-4)' }}>
                <Skeleton width="60%" height={16} />
                <div style={{ marginTop: 12 }}><Skeleton width="100%" height={14} /></div>
                <div style={{ marginTop: 8 }}><Skeleton width="80%" height={14} /></div>
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
          <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)' }}>
              Conversación no encontrada
            </div>
            <Link href="/dashboard/support" style={{ color: 'var(--brand)', marginTop: 'var(--space-3)', display: 'inline-block', fontSize: 'var(--font-size-sm)' }}>
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
        { label: isChat ? 'Chats' : 'Soporte', href: isChat ? '/dashboard/support/chats' : '/dashboard/support' },
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
            userId={d.conversation.user_id}
            clientContext={d.clientContext}
            clientNotes={d.clientNotes}
            clientServices={d.clientServices}
            contextLoading={d.contextLoading}
            isChat={isChat}
            conversationStatus={d.conversation.status}
            conversationId={d.conversation.id}
            conversationLabel={getDetailDisplayTitle(d.conversation)}
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

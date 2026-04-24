'use client';

import { useChatPanel } from './useChatPanel';
import ChatList from './ChatList';
import ChatConversation from './ChatConversation';
import ChatClientContext from './ChatClientContext';
import ResolutionModal from './ResolutionModal';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   Agent Live Chat Panel — Orchestrator
   Workspace layout: 3 columns (UI_SPEC §2.7)
   Chat List | Conversation | Client Context
   All state lives in useChatPanel hook.
   Ref: DECISIONS.md §43, ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

export default function AgentChatPanel() {
  const panel = useChatPanel();

  return (
    <>
      <div className={styles.workspace}>
        {/* Left: Chat list */}
        <ChatList
          chats={panel.chats}
          activeChat={panel.activeChat}
          loadingChats={panel.loadingChats}
          chatSearch={panel.chatSearch}
          currentUserId={panel.user?.id}
          onSearchChange={panel.setChatSearch}
          onSelectChat={panel.openChat}
        />

        {/* Center: Conversation */}
        <ChatConversation
          activeChat={panel.activeChat}
          currentUserId={panel.user?.id}
          typingIndicator={panel.typingIndicator}
          message={panel.message}
          internalNote={panel.internalNote}
          sending={panel.sending}
          messagesEndRef={panel.messagesEndRef}
          onMessageChange={panel.setMessage}
          onInternalNoteChange={panel.setInternalNote}
          onSend={panel.handleSend}
          onTyping={panel.handleTyping}
          onResolve={() => panel.openResolutionModal('resolve')}
          onClose={() => panel.openResolutionModal('close')}
        />

        {/* Right: Client context */}
        <ChatClientContext
          activeChat={panel.activeChat}
          clientContext={panel.clientContext}
          clientServices={panel.clientServices}
          clientNotes={panel.clientNotes}
          contextError={panel.contextError}
          linkSearch={panel.linkSearch}
          linkResults={panel.linkResults}
          linkLoading={panel.linkLoading}
          showLinkPanel={panel.showLinkPanel}
          onLinkSearchChange={panel.setLinkSearch}
          onSearchClients={panel.searchClients}
          onLinkClient={panel.linkGuestToClient}
          onEscalate={() => panel.openResolutionModal('escalate')}
        />
      </div>

      {/* Resolution modal */}
      <ResolutionModal
        open={panel.resolutionModal !== null}
        modal={panel.resolutionModal}
        note={panel.resolutionNote}
        loading={panel.resolutionLoading}
        onNoteChange={panel.setResolutionNote}
        onSubmit={panel.submitResolution}
        onCancel={panel.closeResolutionModal}
      />
    </>
  );
}

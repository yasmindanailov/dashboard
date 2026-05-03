'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../../lib/auth-context';
import { getWsTokenAction } from '../../../lib/auth-actions';
import {
  addMessageAction,
  escalateChatToTicketAction,
  getChatAction,
  getConversationClientContextAction,
  linkGuestToClientAction,
  listChatsAction,
  searchClientsAction,
  updateConversationAction,
} from '../../../_shared/support/_actions';
import { useToast } from '../../../components/ui';
import type { Client, ClientNote, Service } from '../../../lib/types';
import type { Chat, Message, ClientProfile, ResolutionModalState } from './types';

/* ═══════════════════════════════════════
   useChatPanel — Sprint 13 §13.AUTH Fase E (Modelo A).

   Reescrito ADR-078 Amendment A1:
     - REST → Server Actions (cero localStorage cliente).
     - WS handshake → token efímero `getWsTokenAction()` (Sprint
       13.AUTH.A POST /auth/ws-token, claim type='ws', expira 60s).

   Ref: DECISIONS.md §43, ARCHITECTURE.md Regla 15.
   ═══════════════════════════════════════ */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function useChatPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);

  const [clientContext, setClientContext] = useState<ClientProfile | null>(null);
  const [clientServices, setClientServices] = useState<Service[]>([]);
  const [contextError, setContextError] = useState<string | null>(null);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);

  const [resolutionModal, setResolutionModal] = useState<ResolutionModalState | null>(
    null,
  );
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionLoading, setResolutionLoading] = useState(false);

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [chatSearch, setChatSearch] = useState('');

  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<Client[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);

  const loadChats = useCallback(async () => {
    const result = await listChatsAction({
      limit: 50,
      search: chatSearch || undefined,
    });
    if (result.ok) setChats(result.chats);
    setLoadingChats(false);
  }, [chatSearch]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  /*
   * WebSocket — Sprint 13 §13.AUTH (Modelo A): pide WS token efímero
   * via Server Action y úsalo para el handshake socket.io.
   */
  useEffect(() => {
    let cancelled = false;
    let s: Socket | null = null;

    void (async () => {
      const wsToken = await getWsTokenAction();
      if (cancelled || !wsToken) return;

      s = io(`${WS_URL}/support`, {
        auth: { token: wsToken.token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
      });

      s.on('connect', () => console.log('[AgentChat] WS connected'));

      s.on('message:new', (data: { conversationId: string; message: Message }) => {
        setActiveChat((prev) => {
          if (!prev || prev.id !== data.conversationId) return prev;
          if (prev.messages.some((m) => m.id === data.message.id)) return prev;
          return { ...prev, messages: [...prev.messages, data.message] };
        });
        void loadChats();
      });

      s.on('conversation:new', () => void loadChats());
      s.on('conversation:updated', () => void loadChats());

      s.on('typing:start', (data: { conversationId: string }) => {
        setActiveChat((prev) => {
          if (prev?.id === data.conversationId) setTypingIndicator(true);
          return prev;
        });
      });
      s.on('typing:stop', () => setTypingIndicator(false));

      setSocket(s);
    })();

    return () => {
      cancelled = true;
      s?.disconnect();
    };
  // loadChats se re-crea con cada cambio de chatSearch; el effect se reejecuta
  // y reconecta. Aceptable: la conexión WS sólo se reabre cuando el agente
  // cambia el search, evento humano de baja frecuencia.
  }, [loadChats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  const openChat = async (chatId: string) => {
    setClientContext(null);
    setClientServices([]);
    setClientNotes([]);
    setContextError(null);

    const result = await getChatAction(chatId);
    if (!result.ok) {
      console.warn('[ChatPanel] getChat failed:', result.error);
      return;
    }
    const conv = result.chat;
    setActiveChat(conv);
    setTypingIndicator(false);
    socket?.emit('conversation:join', { conversationId: chatId });

    if (!conv.user_id) {
      setContextError('Chat sin usuario vinculado (anónimo o huérfano).');
      return;
    }
    const ctx = await getConversationClientContextAction(conv.user_id);
    if (!ctx.ok) {
      setContextError(ctx.error);
      return;
    }
    setClientContext(ctx.context.client as ClientProfile | null);
    setClientServices(ctx.context.services);
    setClientNotes(ctx.context.notes);
  };

  const leaveChat = () => {
    if (activeChat) socket?.emit('conversation:leave', { conversationId: activeChat.id });
    setActiveChat(null);
    setClientContext(null);
    setClientServices([]);
  };

  const handleSend = async () => {
    if (!message.trim() || !activeChat || sending) return;
    setSending(true);

    const body = message.trim();
    /*
     * Sprint 16 / ADR-079 §3.8: la entrada de notas internas desde el
     * input se eliminó. Los mensajes nuevos siempre son públicos.
     * Preferimos el envío via WS (latencia menor); fallback REST.
     */
    if (socket?.connected) {
      socket.emit('message:send', {
        conversationId: activeChat.id,
        body,
        is_internal: false,
      });
    } else {
      const result = await addMessageAction(activeChat.id, body, false);
      if (!result.ok) {
        toast('error', result.error);
      }
    }

    setMessage('');
    setSending(false);
  };

  const handleTyping = () => {
    if (!activeChat || !socket) return;
    socket.emit('typing', { conversationId: activeChat.id, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { conversationId: activeChat.id, isTyping: false });
    }, 2000);
  };

  const openResolutionModal = (type: ResolutionModalState['type']) => {
    setResolutionModal({ type });
    setResolutionNote('');
  };

  const closeResolutionModal = () => {
    setResolutionModal(null);
    setResolutionNote('');
  };

  const submitResolution = async () => {
    if (!activeChat || !resolutionNote.trim()) return;
    setResolutionLoading(true);
    const note = resolutionNote.trim();
    let result: { ok: boolean; error?: string };
    if (resolutionModal?.type === 'escalate') {
      result = await escalateChatToTicketAction(activeChat.id, {
        category: 'escalated_chat',
        agent_notes: note,
      });
    } else {
      result = await updateConversationAction(activeChat.id, {
        status: resolutionModal?.type === 'close' ? 'closed' : 'resolved',
        resolution_note: note,
      });
    }
    setResolutionLoading(false);
    if (!result.ok) {
      toast('error', result.error || 'Error al procesar.');
      return;
    }
    closeResolutionModal();
    const labels: Record<string, string> = {
      resolve: 'Chat resuelto.',
      close: 'Chat cerrado.',
      escalate: 'Chat escalado a ticket.',
    };
    toast('success', labels[resolutionModal?.type || ''] || 'Acción completada.');
    leaveChat();
    void loadChats();
  };

  const searchClients = async () => {
    if (!linkSearch.trim()) return;
    setLinkLoading(true);
    const result = await searchClientsAction(linkSearch.trim());
    setLinkLoading(false);
    if (!result.ok) {
      setLinkResults([]);
      return;
    }
    setLinkResults(result.clients);
    setShowLinkPanel(true);
  };

  const linkGuestToClient = async (clientId: string, clientName: string) => {
    if (!activeChat) return;
    const result = await linkGuestToClientAction(activeChat.id, clientId);
    if (!result.ok) {
      toast('error', result.error || 'Error al vincular.');
      return;
    }
    setShowLinkPanel(false);
    setLinkSearch('');
    setLinkResults([]);
    toast('success', `Conversación vinculada a ${clientName}.`);
    void openChat(activeChat.id);
  };

  return {
    user,
    chats,
    activeChat,
    loadingChats,
    chatSearch,
    setChatSearch,
    openChat,
    leaveChat,
    message,
    setMessage,
    sending,
    typingIndicator,
    messagesEndRef,
    handleSend,
    handleTyping,
    clientContext,
    clientServices,
    clientNotes,
    contextError,
    resolutionModal,
    resolutionNote,
    setResolutionNote,
    resolutionLoading,
    openResolutionModal,
    closeResolutionModal,
    submitResolution,
    linkSearch,
    setLinkSearch,
    linkResults,
    linkLoading,
    showLinkPanel,
    searchClients,
    linkGuestToClient,
  };
}

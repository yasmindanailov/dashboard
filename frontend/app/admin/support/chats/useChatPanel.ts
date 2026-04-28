'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../../lib/auth-context';
import { supportApi, clientsApi } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import { useToast } from '../../../components/ui';
import type {
  Client,
  ClientNote,
  Pagination,
  Service,
} from '../../../lib/types';
import type { Chat, Message, ClientProfile, ResolutionModalState } from './types';

/* ═══════════════════════════════════════
   Custom hook: Agent Chat Panel state
   Encapsulates WebSocket, data loading,
   messaging, resolution, and guest linking.
   Ref: DECISIONS.md §43, ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function useChatPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);

  // Chats
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);

  // Client context
  const [clientContext, setClientContext] = useState<ClientProfile | null>(null);
  const [clientServices, setClientServices] = useState<Service[]>([]);
  const [contextError, setContextError] = useState<string | null>(null);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);

  // Resolution modal (7.H17)
  const [resolutionModal, setResolutionModal] = useState<ResolutionModalState | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionLoading, setResolutionLoading] = useState(false);

  // Messaging
  const [message, setMessage] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search
  const [chatSearch, setChatSearch] = useState('');

  // Guest linking (7.5.2)
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<Client[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  /* ─── Load chats (declarado antes del WS effect para que el compiler
         pueda analizar la referencia desde dentro del effect — React 19
         hooks plugin no maneja forward references). ─── */

  const loadChats = useCallback(async () => {
    if (!token) return;
    try {
      const res = (await supportApi.listChats(token, {
        limit: 50,
        ...(chatSearch ? { search: chatSearch } : {}),
      })) as Pagination<Chat>;
      setChats(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingChats(false); }
  }, [token, chatSearch]);

  useEffect(() => { loadChats(); }, [loadChats]);

  /* ─── WebSocket ─── */

  useEffect(() => {
    if (!token) return;

    const s = io(`${WS_URL}/support`, {
      auth: { token },
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
      loadChats();
    });

    s.on('conversation:new', () => loadChats());
    s.on('conversation:updated', () => loadChats());

    s.on('typing:start', (data: { conversationId: string }) => {
      setActiveChat((prev) => {
        if (prev?.id === data.conversationId) setTypingIndicator(true);
        return prev;
      });
    });
    s.on('typing:stop', () => setTypingIndicator(false));

    setSocket(s);
    return () => { s.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  /* ─── Open chat + load client context ─── */

  const openChat = async (chatId: string) => {
    setClientContext(null);
    setClientServices([]);
    setClientNotes([]);
    setContextError(null);

    try {
      const conv = await supportApi.getConversation(token, chatId) as Chat;
      setActiveChat(conv);
      setTypingIndicator(false);
      socket?.emit('conversation:join', { conversationId: chatId });

      if (conv.user_id) {
        try {
          const client = await clientsApi.get(token, conv.user_id) as ClientProfile;
          setClientContext(client);
        } catch (err) {
          console.warn('[ChatPanel] loadClientProfile failed:', err);
          setContextError('No se pudo cargar el perfil del cliente.');
        }

        try {
          const svcRes = await (await fetch(
            `${API_URL}/services?user_id=${conv.user_id}&limit=5`,
            { headers: { Authorization: `Bearer ${token}` } }
          )).json();
          setClientServices(svcRes.data || []);
        } catch (err) { console.warn('[ChatPanel] loadServices failed:', err); setClientServices([]); }

        try {
          const notesRes = (await clientsApi.listStructuredNotes(token, conv.user_id, { limit: 5 })) as Pagination<ClientNote>;
          setClientNotes(notesRes.data || []);
        } catch (err) { console.warn('[ChatPanel] loadNotes failed:', err); setClientNotes([]); }
      } else {
        setContextError('Chat sin usuario vinculado (anónimo o huérfano).');
      }
    } catch (e) { console.error(e); }
  };

  const leaveChat = () => {
    if (activeChat) socket?.emit('conversation:leave', { conversationId: activeChat.id });
    setActiveChat(null);
    setClientContext(null);
    setClientServices([]);
  };

  /* ─── Send message ─── */

  const handleSend = async () => {
    if (!message.trim() || !activeChat || sending) return;
    setSending(true);

    const body = message.trim();
    const isInt = internalNote;

    if (socket?.connected) {
      socket.emit('message:send', {
        conversationId: activeChat.id,
        body,
        is_internal: isInt,
      });
    } else {
      try {
        await supportApi.addMessage(token, activeChat.id, { body, is_internal: isInt });
      } catch (e) { console.error('[AgentChat] REST fallback failed:', e); }
    }

    setMessage('');
    setInternalNote(false);
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

  /* ─── Resolution actions ─── */

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
    try {
      if (resolutionModal?.type === 'escalate') {
        await supportApi.escalateToTicket(token, activeChat.id, {
          category: 'escalated_chat',
          agent_notes: resolutionNote.trim(),
        });
      } else {
        await supportApi.updateConversation(token, activeChat.id, {
          status: resolutionModal?.type === 'close' ? 'closed' : 'resolved',
          resolution_note: resolutionNote.trim(),
        });
      }
      closeResolutionModal();
      const labels: Record<string, string> = {
        resolve: 'Chat resuelto.', close: 'Chat cerrado.', escalate: 'Chat escalado a ticket.',
      };
      toast('success', labels[resolutionModal?.type || ''] || 'Acción completada.');
      leaveChat();
      loadChats();
    } catch (e) {
      toast('error', getErrorMessage(e) || 'Error al procesar.');
    } finally {
      setResolutionLoading(false);
    }
  };

  /* ─── Guest linking ─── */

  const searchClients = async () => {
    if (!linkSearch.trim()) return;
    setLinkLoading(true);
    try {
      const res = (await clientsApi.list(token, { search: linkSearch.trim(), limit: 5 })) as Pagination<Client>;
      setLinkResults(res.data || []);
      setShowLinkPanel(true);
    } catch (err) { console.warn('[ChatPanel] linkSearch failed:', err); setLinkResults([]); }
    finally { setLinkLoading(false); }
  };

  const linkGuestToClient = async (clientId: string, clientName: string) => {
    if (!activeChat) return;
    try {
      await supportApi.linkGuestToClient(token, activeChat.id, clientId);
      setShowLinkPanel(false);
      setLinkSearch('');
      setLinkResults([]);
      toast('success', `Conversación vinculada a ${clientName}.`);
      openChat(activeChat.id);
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al vincular.');
    }
  };

  return {
    user,
    // Chats
    chats, activeChat, loadingChats, chatSearch, setChatSearch,
    openChat, leaveChat,
    // Messages
    message, setMessage, internalNote, setInternalNote,
    sending, typingIndicator, messagesEndRef,
    handleSend, handleTyping,
    // Client context
    clientContext, clientServices, clientNotes, contextError,
    // Resolution
    resolutionModal, resolutionNote, setResolutionNote, resolutionLoading,
    openResolutionModal, closeResolutionModal, submitResolution,
    // Guest linking
    linkSearch, setLinkSearch, linkResults, linkLoading,
    showLinkPanel, searchClients, linkGuestToClient,
  };
}

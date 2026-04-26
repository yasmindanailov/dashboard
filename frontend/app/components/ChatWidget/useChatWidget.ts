'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { supportApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';
import type { Conversation, Message } from './types';

/* ═══════════════════════════════════════
   useChatWidget — state & WebSocket hook
   Handles both authenticated and guest modes.
   Ref: DECISIONS.md §9, ROADMAP.md 7.4.5, 7.H12
   ═══════════════════════════════════════ */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

/**
 * Safe auth hook — works both inside and outside AuthProvider.
 * Returns null user when no AuthProvider is present (guest/landing context).
 */
function useAuthSafe() {
  try {
    const { useAuth } = require('../../lib/auth-context');
    return useAuth();
  } catch {
    return { user: null, isAuthenticated: false };
  }
}

export function useChatWidget() {
  const { user } = useAuthSafe();
  const isGuest = !user;

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Conversation state
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [view, setView] = useState<'list' | 'chat' | 'guest-form'>('list');

  // Guest-specific state (7.4.5)
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestConversationId, setGuestConversationId] = useState<string | null>(null);

  // Chat
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  /* ─── WebSocket Connection ─── */

  const connectSocket = useCallback((authToken?: string) => {
    const socketOptions: {
      transports: string[];
      reconnection: boolean;
      reconnectionDelay: number;
      reconnectionAttempts: number;
      auth?: { token: string };
      withCredentials?: boolean;
    } = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    };

    if (authToken) {
      socketOptions.auth = { token: authToken };
    } else {
      socketOptions.withCredentials = true;
    }

    const newSocket = io(`${WS_URL}/support`, socketOptions);

    newSocket.on('connect', () => {
      console.log(`[ChatWidget] Connected (${authToken ? 'auth' : 'guest'})`);
    });

    newSocket.on('unread:update', (data: { count: number }) => {
      setUnreadCount(data.count);
    });

    newSocket.on('message:new', (data: { conversationId: string; message: Message }) => {
      setActiveConversation((prev) => {
        if (!prev || prev.id !== data.conversationId) return prev;
        return { ...prev, messages: [...prev.messages, data.message] };
      });
    });

    newSocket.on('typing:start', () => setTypingIndicator(true));
    newSocket.on('typing:stop', () => setTypingIndicator(false));

    setSocket(newSocket);
    return newSocket;
  }, []);

  // Auto-connect for authenticated users
  useEffect(() => {
    if (!token) return;
    const s = connectSocket(token);
    return () => { s.disconnect(); };
  }, [token, connectSocket]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, isOpen, view]);

  /* ─── Load conversations ─── */

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await supportApi.listChats(token, { limit: 10 }) as { data: Conversation[] };
      setConversations(res.data || []);
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    if (isOpen && !isGuest) loadConversations();
    if (isOpen && isGuest && !guestConversationId) setView('guest-form');
  }, [isOpen, isGuest, guestConversationId, loadConversations]);

  /* ─── Open / Close conversation ─── */

  const openConversation = async (id: string) => {
    try {
      const conv = await supportApi.getConversation(token, id) as Conversation;
      setActiveConversation(conv);
      setView('chat');
      socket?.emit('conversation:join', { conversationId: id });
    } catch (e) { console.error(e); }
  };

  const closeConversation = () => {
    if (activeConversation) {
      socket?.emit('conversation:leave', { conversationId: activeConversation.id });
    }
    setActiveConversation(null);
    setView('list');
    loadConversations();
  };

  /* ─── Send message ─── */

  const handleSend = async () => {
    if (!message.trim() || !activeConversation || sending) return;
    setSending(true);

    const body = message.trim();

    if (socket?.connected) {
      socket.emit('message:send', { conversationId: activeConversation.id, body });
    } else {
      try {
        await supportApi.addMessage(token, activeConversation.id, { body });
      } catch (e) { console.error('[ChatWidget] REST fallback failed:', e); }
    }

    setMessage('');
    setSending(false);
  };

  const handleTyping = () => {
    if (!activeConversation || !socket) return;
    socket.emit('typing', { conversationId: activeConversation.id, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { conversationId: activeConversation.id, isTyping: false });
    }, 2000);
  };

  /* ─── Create new chat (7.H12) ─── */

  const startNewChat = async () => {
    if (!token || sending) return;
    setSending(true);
    try {
      const subject = 'Nueva conversación';
      const conv = await supportApi.createChat(token, { subject, body: '' }) as Conversation;
      await openConversation(conv.id);
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  /* ─── Guest first message (7.4.5) ─── */

  const handleGuestFirstMessage = async (body: string) => {
    if (!guestName.trim() || sending) return;
    setSending(true);
    try {
      const res = await supportApi.createGuestChat({
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim() || undefined,
        body,
      });

      setGuestConversationId(res.conversation_id);
      const s = connectSocket();

      const tempConv: Conversation = {
        id: res.conversation_id,
        subject: res.subject,
        status: 'open',
        last_agent_response_at: null,
        messages: [{
          id: 'temp-' + Date.now(),
          sender_type: 'client',
          sender_id: null,
          sender_name: guestName.trim(),
          body,
          is_internal: false,
          read_at: null,
          created_at: res.created_at,
        }],
      };

      setActiveConversation(tempConv);
      setView('chat');

      s.on('connect', () => {
        s.emit('conversation:join', { conversationId: res.conversation_id });
      });
    } catch (e) {
      console.error('[ChatWidget] Guest chat creation failed:', e);
      alert(getErrorMessage(e) || 'Error al crear el chat. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return {
    user, isGuest, isOpen, setIsOpen, unreadCount,
    // Conversation
    activeConversation, conversations, view,
    openConversation, closeConversation,
    // Messages
    message, setMessage, sending, typingIndicator,
    messagesEndRef, handleSend, handleTyping,
    // New chat
    handleFirstMessage: startNewChat,
    // Guest
    guestName, setGuestName, guestEmail, setGuestEmail,
    handleGuestFirstMessage,
  };
}

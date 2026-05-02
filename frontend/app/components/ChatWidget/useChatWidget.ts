'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { supportApi } from '../../lib/api';
import { useAuthOptional } from '../../lib/auth-context';
import { getErrorMessage } from '../../lib/error';
import type { Conversation, Message } from './types';

/* ═══════════════════════════════════════
   useChatWidget — state & WebSocket hook
   Handles both authenticated and guest modes.
   Ref: DECISIONS.md §9, ROADMAP.md 7.4.5, 7.H12
   ═══════════════════════════════════════ */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function useChatWidget() {
  // useAuthOptional para soportar montaje fuera de AuthProvider (landing).
  const { user } = useAuthOptional();
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

  /* Sprint 16 (ADR-079 amendment A3): refs vivas del socket y de la
     conversación activa. Resuelven dos problemas críticos:
       1. Closure stale en `connectSocket` (useCallback([])): los handlers
          registrados al conectar leían `socket` desde el estado capturado
          en el primer render (null) — perdían eventos hasta que el
          componente se re-renderizaba.
       2. Reconexión automática de Socket.IO: tras un disconnect + reconnect,
          el server PIERDE la membership de las rooms. El cliente debe
          re-emitir `conversation:join` cada vez que se conecta. Sin esto,
          el cliente perdía silenciosamente `message:new` y
          `conversation:updated` después de cualquier reconexión. */
  const socketRef = useRef<Socket | null>(null);
  const activeConvIdRef = useRef<string | null>(null);

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
      /* Re-join automático: tras conectar (incluida cualquier reconexión),
         si tenemos conversación activa, emitimos `conversation:join` para
         restablecer la membership de la room en el server. Sin esto, el
         cliente perdía mensajes y cambios de estado en tiempo real tras
         desconexiones transitorias de red. */
      const convId = activeConvIdRef.current;
      if (convId) {
        newSocket.emit('conversation:join', { conversationId: convId });
      }
    });

    newSocket.on('unread:update', (data: { count: number }) => {
      setUnreadCount(data.count);
    });

    newSocket.on('message:new', (data: { conversationId: string; message: Message }) => {
      setActiveConversation((prev) => {
        if (!prev || prev.id !== data.conversationId) return prev;
        // Idempotencia: evita duplicar si el server emite dos veces.
        if (prev.messages.some((m) => m.id === data.message.id)) return prev;
        return { ...prev, messages: [...prev.messages, data.message] };
      });
    });

    /* Sprint 16 (ADR-079 amendment A3): escuchar cambios de estado de la
       conversación (resolver, escalar) para que el widget cliente actualice
       su UI en tiempo real — sin esto, el cliente ve el chat como vivo
       aunque el agente lo haya cerrado y solo se entera al recargar o al
       intentar enviar un mensaje y recibir 400. */
    newSocket.on(
      'conversation:updated',
      (data: { conversationId: string; status?: string }) => {
        setActiveConversation((prev) => {
          if (!prev || prev.id !== data.conversationId) return prev;
          return {
            ...prev,
            status: data.status ?? prev.status,
          };
        });
        // Si el chat pasó a `resolved`, hacemos refetch para obtener el
        // `escalated_to` enriquecido del backend (cuando aplica) y mostrar
        // el banner con link al ticket destino. Best effort — sin token
        // o con error, la UI se queda con el status nuevo y sin banner.
        const liveToken =
          typeof window !== 'undefined'
            ? localStorage.getItem('access_token') || ''
            : '';
        if (data.status === 'resolved' && liveToken) {
          supportApi
            .getConversation(liveToken, data.conversationId)
            .then((conv) => {
              setActiveConversation((prev) => {
                if (!prev || prev.id !== data.conversationId) return prev;
                return conv as Conversation;
              });
            })
            .catch(() => {});
        }
      },
    );

    newSocket.on('typing:start', () => setTypingIndicator(true));
    newSocket.on('typing:stop', () => setTypingIndicator(false));

    setSocket(newSocket);
    socketRef.current = newSocket;
    return newSocket;
  }, []);

  /* Auto-connect for authenticated users.
     Sprint 16 (ADR-079 amendment A3): garantizar UN único socket activo.
     React StrictMode + Fast Refresh ejecutan el efecto múltiples veces;
     cada vez creaba un socket nuevo, el cleanup destruía el anterior, y
     se perdían las rooms y los handlers. Resultado: el cliente "quedaba
     conectado" pero a un socket vivo distinto al que tenía las
     suscripciones — los eventos `conversation:updated` nunca llegaban.
     El gating por `socketRef.current` evita reconexiones espurias. */
  useEffect(() => {
    if (!token) return;
    if (socketRef.current?.connected) return;
    const s = connectSocket(token);
    return () => {
      if (socketRef.current === s) {
        s.disconnect();
        socketRef.current = null;
      }
    };
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
      activeConvIdRef.current = id;
      // Usamos socketRef (siempre vivo) en lugar del state — `socket` puede
      // ser null en el primer render aunque la conexión ya esté activa.
      // Si todavía no conectó, el handler 'connect' re-emite conversation:join
      // leyendo activeConvIdRef.current.
      const liveSocket = socketRef.current;
      if (liveSocket?.connected) {
        liveSocket.emit('conversation:join', { conversationId: id });
      }
    } catch (e) { console.error(e); }
  };

  const closeConversation = () => {
    if (activeConversation) {
      socketRef.current?.emit('conversation:leave', {
        conversationId: activeConversation.id,
      });
    }
    activeConvIdRef.current = null;
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

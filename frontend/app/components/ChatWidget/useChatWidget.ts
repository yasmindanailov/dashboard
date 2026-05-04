'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { supportApi } from '../../lib/api';
import { useAuthOptional } from '../../lib/auth-context';
import { getWsTokenAction } from '../../lib/auth-actions';
import {
  addMessageAction,
  createChatAction,
  getConversationAction,
  listChatsAction,
} from '../../_shared/support/_actions';
import { getErrorMessage } from '../../lib/error';
import type { Conversation, Message } from './types';

/* ═══════════════════════════════════════
   useChatWidget — Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 A1).

   Doctrina dual:
     - Authenticated mode: WS handshake con `getWsTokenAction()` (token
       efímero firmado por backend, claim type='ws', expira 60s). REST
       via Server Actions.
     - Guest mode: WS handshake con `withCredentials: true` — el backend
       gestiona la sesión guest con su propia cookie httpOnly (canal
       independiente del JWT auth). REST guest sigue via supportApi
       directo (`createGuestChat` no requiere auth).

   Ref: DECISIONS.md §9, ROADMAP.md 7.4.5, 7.H12. Sprint 16 (ADR-079
   amendment A3): refs vivas + re-join automático tras reconexión.
   ═══════════════════════════════════════ */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function useChatWidget() {
  const { user } = useAuthOptional();
  const isGuest = !user;

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(
    null,
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [view, setView] = useState<'list' | 'chat' | 'guest-form'>('list');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestConversationId, setGuestConversationId] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /*
   * Sprint 16 (ADR-079 amendment A3): refs vivas — resuelven closure
   * stale en `connectSocket` (handlers leían `socket` del primer render
   * = null) y re-join tras reconnect (Socket.IO pierde rooms en server
   * tras desconexión).
   */
  const socketRef = useRef<Socket | null>(null);
  const activeConvIdRef = useRef<string | null>(null);

  /*
   * `connectSocket` recibe el WS token (auth mode) o ninguno (guest mode
   * usa cookie httpOnly del backend de sesión guest).
   */
  const connectSocket = useCallback((wsToken?: string) => {
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

    if (wsToken) {
      socketOptions.auth = { token: wsToken };
    } else {
      socketOptions.withCredentials = true;
    }

    const newSocket = io(`${WS_URL}/support`, socketOptions);

    newSocket.on('connect', () => {
      /*
       * Re-join automático: tras conectar (incluida cualquier
       * reconexión), si tenemos conversación activa, re-emitimos
       * `conversation:join` para restablecer la membership en server.
       */
      const convId = activeConvIdRef.current;
      if (convId) {
        newSocket.emit('conversation:join', { conversationId: convId });
      }
    });

    newSocket.on('unread:update', (data: { count: number }) => {
      setUnreadCount(data.count);
    });

    newSocket.on(
      'message:new',
      (data: { conversationId: string; message: Message }) => {
        setActiveConversation((prev) => {
          if (!prev || prev.id !== data.conversationId) return prev;
          if (prev.messages.some((m) => m.id === data.message.id)) return prev;
          return { ...prev, messages: [...prev.messages, data.message] };
        });
      },
    );

    /*
     * Sprint 16 (ADR-079 amendment A3): escuchar cambios de estado para
     * que el widget cliente actualice su UI en tiempo real (cierre
     * resuelto/escalado por el agente).
     */
    newSocket.on(
      'conversation:updated',
      (data: { conversationId: string; status?: string }) => {
        setActiveConversation((prev) => {
          if (!prev || prev.id !== data.conversationId) return prev;
          return { ...prev, status: data.status ?? prev.status };
        });
        /*
         * Si el chat pasó a `resolved`, refetch para enriquecer
         * `escalated_to` (mostrar banner con link al ticket destino).
         * Best effort — sin sesión o con error, la UI se queda con el
         * status nuevo y sin banner.
         */
        if (data.status === 'resolved') {
          void getConversationAction(data.conversationId).then((result) => {
            if (!result.ok) return;
            setActiveConversation((prev) => {
              if (!prev || prev.id !== data.conversationId) return prev;
              return result.conversation as unknown as Conversation;
            });
          });
        }
      },
    );

    newSocket.on('typing:start', () => setTypingIndicator(true));
    newSocket.on('typing:stop', () => setTypingIndicator(false));

    setSocket(newSocket);
    socketRef.current = newSocket;
    return newSocket;
  }, []);

  /*
   * Auto-connect for authenticated users. Sprint 16 (ADR-079 A3):
   * gating por `socketRef.current` evita reconexiones espurias en
   * StrictMode + Fast Refresh. Pide WS token efímero al backend.
   */
  useEffect(() => {
    if (isGuest) return;
    if (socketRef.current?.connected) return;
    let cancelled = false;
    let s: Socket | null = null;
    void (async () => {
      const wsToken = await getWsTokenAction();
      if (cancelled || !wsToken) return;
      s = connectSocket(wsToken.token);
    })();
    return () => {
      cancelled = true;
      if (s && socketRef.current === s) {
        s.disconnect();
        socketRef.current = null;
      }
    };
  }, [isGuest, connectSocket]);

  useEffect(() => {
    if (isOpen && view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, isOpen, view]);

  const loadConversations = useCallback(async () => {
    const result = await listChatsAction({ limit: 10 });
    if (result.ok) {
      setConversations(result.chats as unknown as Conversation[]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on widget open (lista de conversaciones) + sync de la vista guest cuando arranca sin conversación previa.
    if (isOpen && !isGuest) void loadConversations();
    if (isOpen && isGuest && !guestConversationId) setView('guest-form');
  }, [isOpen, isGuest, guestConversationId, loadConversations]);

  const openConversation = async (id: string) => {
    const result = await getConversationAction(id);
    if (!result.ok) {
      console.error('[ChatWidget] openConversation failed:', result.error);
      return;
    }
    setActiveConversation(result.conversation as unknown as Conversation);
    setView('chat');
    activeConvIdRef.current = id;
    /*
     * Usamos socketRef (siempre vivo) en lugar del state — `socket`
     * puede ser null en el primer render aunque la conexión ya esté
     * activa. Si todavía no conectó, el handler 'connect' re-emite
     * conversation:join leyendo activeConvIdRef.current.
     */
    const liveSocket = socketRef.current;
    if (liveSocket?.connected) {
      liveSocket.emit('conversation:join', { conversationId: id });
    }
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
    void loadConversations();
  };

  const handleSend = async () => {
    if (!message.trim() || !activeConversation || sending) return;
    setSending(true);
    const body = message.trim();

    if (socket?.connected) {
      socket.emit('message:send', { conversationId: activeConversation.id, body });
    } else {
      const result = await addMessageAction(activeConversation.id, body, false);
      if (!result.ok) {
        console.error('[ChatWidget] REST fallback failed:', result.error);
      }
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

  const startNewChat = async () => {
    if (sending) return;
    setSending(true);
    const result = await createChatAction({
      subject: 'Nueva conversación',
      body: '',
    });
    setSending(false);
    if (!result.ok) {
      console.error('[ChatWidget] createChat failed:', result.error);
      return;
    }
    await openConversation(result.chat.id);
  };

  /*
   * Guest first message — sigue usando supportApi.createGuestChat
   * (endpoint backend sin auth, gestiona su propia cookie session).
   * El WS guest se conecta con `withCredentials: true` (sin wsToken).
   */
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
        messages: [
          {
            id: 'temp-' + Date.now(),
            sender_type: 'client',
            sender_id: null,
            sender_name: guestName.trim(),
            body,
            is_internal: false,
            read_at: null,
            created_at: res.created_at,
          },
        ],
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
    user,
    isGuest,
    isOpen,
    setIsOpen,
    unreadCount,
    activeConversation,
    conversations,
    view,
    openConversation,
    closeConversation,
    message,
    setMessage,
    sending,
    typingIndicator,
    messagesEndRef,
    handleSend,
    handleTyping,
    handleFirstMessage: startNewChat,
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    handleGuestFirstMessage,
  };
}

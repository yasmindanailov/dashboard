'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../../lib/auth-context';
import { getWsTokenAction } from '../../../lib/auth-actions';
import {
  addMessageAction,
  escalateChatToTicketAction,
  getAiSuggestionEnabledAction,
  getConversationAction,
  getConversationClientContextAction,
  updateConversationAction,
} from '../_actions';
import { useToast } from '../../../components/ui';
import type { Client, ClientNote, Service } from '../../../lib/types';
import type { ConversationDetail, ResolutionType } from './types';
import { ADMIN_ROLES } from './types';

/* ═══════════════════════════════════════
   useConversationDetail — Sprint 13 §13.AUTH Fase E (Modelo A).

   Reescrito ADR-078 Amendment A1:
     - REST → Server Actions (cero localStorage cliente).
     - WS handshake → token efímero `getWsTokenAction()` (Sprint
       13.AUTH.A nuevo endpoint POST /auth/ws-token, claim type='ws',
       expira 60s). El browser NUNCA accede al access cookie httpOnly.

   Ref: DECISIONS.md §43, §46, 7.H17. Sprint 13.5 Fase D (DC.37) WS
   tiempo real (mensajes + estado + typing). Sprint 16 Amendment A3
   unificó la emisión REST/WS server-side.
   ═══════════════════════════════════════ */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function useConversationDetail() {
  const params = useParams();
  const conversationId = params.id as string;
  const { user } = useAuth();
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;
  const { toast } = useToast();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [clientContext, setClientContext] = useState<Client | null>(null);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [clientServices, setClientServices] = useState<Service[]>([]);
  const [contextLoading, setContextLoading] = useState(false);

  const [resolutionModal, setResolutionModal] = useState<{ type: ResolutionType } | null>(
    null,
  );
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionLoading, setResolutionLoading] = useState(false);

  const [peerTyping, setPeerTyping] = useState(false);

  // F3·E13 Fase F — botón "Sugerencia IA" del composer. Es feature de STAFF:
  // solo consultamos el flag si el usuario es agente (el cliente nunca ve el
  // botón; el endpoint además es staff-only). Fail-safe a false.
  const [aiEnabled, setAiEnabled] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const loadConversation = useCallback(async () => {
    if (!conversationId) return;
    const result = await getConversationAction(conversationId);
    if (result.ok) setConversation(result.conversation);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial + recarga on conversationId change (prop-driven sync con backend).
    void loadConversation();
  }, [loadConversation]);

  // F3·E13 Fase F — resuelve el flag de IA una vez (solo staff).
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void getAiSuggestionEnabledAction().then((enabled) => {
      if (!cancelled) setAiEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  /*
   * WebSocket — tiempo real (Sprint 13.5 DC.37 + Sprint 13 §13.AUTH).
   * Pide WS token efímero via Server Action (que reenvía al backend
   * /auth/ws-token con la cookie httpOnly Next.js → access token), y
   * usa ese token para el handshake socket.io. Modelo A: cero acceso
   * del cliente JS a tokens persistentes.
   */
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      const wsToken = await getWsTokenAction();
      if (cancelled || !wsToken) return;

      socket = io(`${WS_URL}/support`, {
        auth: { token: wsToken.token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
      });

      socket.on('connect', () => {
        socket?.emit('conversation:join', { conversationId });
      });

      socket.on('message:new', (data: { conversationId: string }) => {
        if (data.conversationId !== conversationId) return;
        void loadConversation();
      });

      socket.on('conversation:updated', (data: { conversationId: string }) => {
        if (data.conversationId !== conversationId) return;
        void loadConversation();
      });

      socket.on('typing:start', (data: { conversationId: string }) => {
        if (data.conversationId === conversationId) setPeerTyping(true);
      });
      socket.on('typing:stop', (data: { conversationId: string }) => {
        if (data.conversationId === conversationId) setPeerTyping(false);
      });

      socketRef.current = socket;
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit('conversation:leave', { conversationId });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [conversationId, loadConversation]);

  /* Load client context cuando la conversación se hidrata. */
  useEffect(() => {
    const userId = conversation?.user_id;
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on prop change: el contexto cliente se carga cuando hidrata la conversación (dependent fetch).
    setContextLoading(true);
    let cancelled = false;
    void (async () => {
      const result = await getConversationClientContextAction(userId);
      if (cancelled) return;
      if (result.ok) {
        setClientContext(result.context.client);
        setClientNotes(result.context.notes);
        setClientServices(result.context.services);
      }
      setContextLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation?.user_id]);

  /* Auto-scroll al cambiar mensajes. */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversationId) return;
    setSending(true);
    /*
     * Sprint 16 / ADR-079 §3.8: la entrada de notas internas desde el
     * input se eliminó. Los mensajes nuevos siempre son públicos.
     */
    const result = await addMessageAction(conversationId, newMessage.trim(), false);
    setSending(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    setNewMessage('');
    void loadConversation();
  };

  const handleStatusChange = async (status: string) => {
    if (!conversationId) return;
    if (['resolved', 'closed'].includes(status)) {
      setResolutionModal({ type: status === 'closed' ? 'close' : 'resolve' });
      setResolutionNote('');
      return;
    }
    if (status === 'open') {
      setResolutionModal({ type: 'reopen' });
      setResolutionNote('');
      return;
    }
    const result = await updateConversationAction(conversationId, { status });
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    void loadConversation();
  };

  const handlePriorityChange = async (priority: string) => {
    if (!conversationId) return;
    const result = await updateConversationAction(conversationId, { priority });
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    void loadConversation();
    toast('success', 'Prioridad actualizada.');
  };

  /**
   * Sprint 8 Fase B.10 (2026-04-30) — ADR-074. Asignar/reasignar
   * agente dispara el listener `SupportTicketTaskCreatorListener`
   * que crea o reasigna la `Task(type=support_ticket)` vinculada.
   */
  const handleAssignAgent = async (agentId: string) => {
    if (!conversationId) return;
    const result = await updateConversationAction(conversationId, {
      assigned_agent_id: agentId || null,
    });
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    void loadConversation();
    toast(
      'success',
      agentId ? 'Agente asignado. Tarea creada.' : 'Asignación retirada.',
    );
  };

  const handleEscalateToTicket = () => {
    setResolutionModal({ type: 'escalate' });
    setResolutionNote('');
  };

  const submitResolution = async () => {
    if (!resolutionNote.trim()) return;
    setResolutionLoading(true);
    const note = resolutionNote.trim();
    let result: { ok: boolean; error?: string };
    if (resolutionModal?.type === 'escalate') {
      result = await escalateChatToTicketAction(conversationId, {
        category: 'escalated_chat',
        agent_notes: note,
      });
    } else if (resolutionModal?.type === 'reopen') {
      result = await updateConversationAction(conversationId, {
        status: 'open',
        resolution_note: note,
      });
    } else {
      result = await updateConversationAction(conversationId, {
        status: resolutionModal?.type === 'close' ? 'closed' : 'resolved',
        resolution_note: note,
      });
    }
    setResolutionLoading(false);
    if (!result.ok) {
      toast('error', result.error || 'Error al procesar.');
      return;
    }
    setResolutionModal(null);
    setResolutionNote('');
    const labels: Record<string, string> = {
      resolve: 'Ticket resuelto.',
      close: 'Ticket cerrado.',
      escalate: 'Chat escalado a ticket.',
      reopen: 'Ticket reabierto.',
    };
    toast('success', labels[resolutionModal?.type || ''] || 'Acción completada.');
    void loadConversation();
  };

  const closeResolutionModal = () => {
    setResolutionModal(null);
    setResolutionNote('');
  };

  return {
    user,
    isAdmin,
    conversation,
    loading,
    conversationId,
    newMessage,
    setNewMessage,
    sending,
    handleSendMessage,
    messagesEndRef,
    handleStatusChange,
    handlePriorityChange,
    handleEscalateToTicket,
    handleAssignAgent,
    resolutionModal,
    resolutionNote,
    setResolutionNote,
    resolutionLoading,
    submitResolution,
    closeResolutionModal,
    clientContext,
    clientNotes,
    clientServices,
    contextLoading,
    peerTyping,
    aiEnabled,
  };
}

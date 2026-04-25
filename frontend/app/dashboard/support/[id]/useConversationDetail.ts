'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { supportApi, clientsApi } from '../../../lib/api';
import { useToast } from '../../../components/ui';
import type { ConversationDetail, ResolutionType } from './types';
import { ADMIN_ROLES } from './types';

/* ═══════════════════════════════════════
   useConversationDetail — state & data hook
   Handles conversation loading, messaging,
   status/priority changes, resolution workflow,
   and client context sidebar data.
   Ref: DECISIONS.md §43, §46, 7.H17
   ═══════════════════════════════════════ */

export function useConversationDetail() {
  const params = useParams();
  const conversationId = params.id as string;
  const { user } = useAuth();
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;
  const { toast } = useToast();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);

  // Client context sidebar
  const [clientContext, setClientContext] = useState<any>(null);
  const [clientNotes, setClientNotes] = useState<any[]>([]);
  const [clientServices, setClientServices] = useState<any[]>([]);
  const [contextLoading, setContextLoading] = useState(false);

  // Resolution modal (7.H17)
  const [resolutionModal, setResolutionModal] = useState<{ type: ResolutionType } | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionLoading, setResolutionLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  /* ─── Load conversation ─── */

  const loadConversation = useCallback(async () => {
    if (!token || !conversationId) return;
    try {
      const res = await supportApi.getConversation(token, conversationId) as ConversationDetail;
      setConversation(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token, conversationId]);

  useEffect(() => { loadConversation(); }, [loadConversation]);

  // Load client context when conversation loads
  useEffect(() => {
    if (!conversation?.user_id || !token) return;
    setContextLoading(true);
    const uid = conversation.user_id;
    Promise.all([
      clientsApi.get(token, uid).catch(() => null),
      clientsApi.listStructuredNotes(token, uid, { limit: 5 }).catch(() => ({ data: [] })),
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/services?user_id=${uid}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([profile, notesRes, svcRes]: any[]) => {
      setClientContext(profile);
      setClientNotes(notesRes?.data || []);
      setClientServices(svcRes?.data || []);
    }).finally(() => setContextLoading(false));
  }, [conversation?.user_id, token]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  /* ─── Send message ─── */

  const handleSendMessage = async () => {
    if (!token || !newMessage.trim() || !conversationId) return;
    setSending(true);
    try {
      await supportApi.addMessage(token, conversationId, {
        body: newMessage.trim(),
        is_internal: isAdmin ? isInternal : false,
      });
      setNewMessage('');
      setIsInternal(false);
      loadConversation();
    } catch (e) {
      console.error(e);
      toast('error', 'No se pudo enviar el mensaje.');
    }
    finally { setSending(false); }
  };

  /* ─── Status & priority changes ─── */

  const handleStatusChange = async (status: string) => {
    if (!token || !conversationId) return;
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
    try {
      await supportApi.updateConversation(token, conversationId, { status });
      loadConversation();
    } catch (e) {
      console.error(e);
      toast('error', 'No se pudo cambiar el estado.');
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!token || !conversationId) return;
    try {
      await supportApi.updateConversation(token, conversationId, { priority });
      loadConversation();
      toast('success', 'Prioridad actualizada.');
    } catch (e) {
      console.error(e);
      toast('error', 'No se pudo cambiar la prioridad.');
    }
  };

  const handleEscalateToTicket = () => {
    setResolutionModal({ type: 'escalate' });
    setResolutionNote('');
  };

  /* ─── Resolution modal submission ─── */

  const submitResolution = async () => {
    if (!resolutionNote.trim()) return;
    setResolutionLoading(true);
    try {
      if (resolutionModal?.type === 'escalate') {
        await supportApi.escalateToTicket(token, conversationId, {
          category: 'escalated_chat',
          agent_notes: resolutionNote.trim(),
        });
      } else if (resolutionModal?.type === 'reopen') {
        await supportApi.updateConversation(token, conversationId, {
          status: 'open',
          resolution_note: resolutionNote.trim(),
        });
      } else {
        await supportApi.updateConversation(token, conversationId, {
          status: resolutionModal?.type === 'close' ? 'closed' : 'resolved',
          resolution_note: resolutionNote.trim(),
        });
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
      loadConversation();
    } catch (e: any) {
      toast('error', e?.message || 'Error al procesar.');
    } finally {
      setResolutionLoading(false);
    }
  };

  const closeResolutionModal = () => {
    setResolutionModal(null);
    setResolutionNote('');
  };

  return {
    user, isAdmin, conversation, loading, conversationId,
    // Messaging
    newMessage, setNewMessage, isInternal, setIsInternal,
    sending, handleSendMessage, messagesEndRef,
    // Status/priority
    handleStatusChange, handlePriorityChange, handleEscalateToTicket,
    // Resolution
    resolutionModal, resolutionNote, setResolutionNote,
    resolutionLoading, submitResolution, closeResolutionModal,
    // Client context
    clientContext, clientNotes, clientServices, contextLoading,
  };
}

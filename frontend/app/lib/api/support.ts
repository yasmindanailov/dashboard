import { api, API_URL } from './client';

// ── Support API (Dual system: Chat + Tickets) ──

export const supportApi = {
  // ── CHATS (real-time) ──

  listChats: (token: string, params?: {
    page?: number; limit?: number; status?: string; search?: string; user_id?: string;
  }) => {
    const query = new URLSearchParams();
    query.set('type', 'chat');
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.user_id) query.set('user_id', params.user_id);
    return api(`/support/chats?${query.toString()}`, { token });
  },

  createChat: (token: string, data: { subject: string; body: string; service_id?: string }) =>
    api('/support/chats', { method: 'POST', token, body: data }),

  escalateToTicket: (token: string, chatId: string, data: { category: string; subject?: string; priority?: string; agent_notes?: string }) =>
    api(`/support/chats/${chatId}/escalate`, { method: 'POST', token, body: data }),

  // ── TICKETS (async, Gmail-like) ──

  listTickets: (token: string, params?: {
    page?: number; limit?: number; status?: string; priority?: string;
    category?: string; assigned_agent_id?: string; search?: string; user_id?: string;
  }) => {
    const query = new URLSearchParams();
    query.set('type', 'ticket');
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.category) query.set('category', params.category);
    if (params?.assigned_agent_id) query.set('assigned_agent_id', params.assigned_agent_id);
    if (params?.search) query.set('search', params.search);
    if (params?.user_id) query.set('user_id', params.user_id);
    return api(`/support/tickets?${query.toString()}`, { token });
  },

  createTicket: (token: string, data: { subject: string; body: string; category: string; priority?: string; service_id?: string }, targetUserId?: string) => {
    const qs = targetUserId ? `?targetUserId=${targetUserId}` : '';
    return api(`/support/tickets${qs}`, { method: 'POST', token, body: data });
  },

  // ── SHARED (works for both chats and tickets) ──

  getConversation: (token: string, id: string) =>
    api(`/support/conversations/${id}`, { token }),

  updateConversation: (token: string, id: string, data: { status?: string; priority?: string; category?: string; assigned_agent_id?: string | null; resolution_note?: string; tags?: string[] }) =>
    api(`/support/conversations/${id}`, { method: 'PATCH', token, body: data }),

  /**
   * Sprint 16 (ADR-079 amendment): el cliente confirma la resolución de un
   * ticket en `resolved` → cierra explícito (`→closed`). Endpoint exclusivo
   * cliente. El admin usa `updateConversation({status:'closed'})` con nota.
   */
  confirmResolution: (token: string, conversationId: string) =>
    api(`/support/conversations/${conversationId}/confirm-resolution`, {
      method: 'PATCH',
      token,
    }),

  addMessage: (token: string, conversationId: string, data: { body: string; is_internal?: boolean }) =>
    api(`/support/conversations/${conversationId}/messages`, { method: 'POST', token, body: data }),

  markAsRead: (token: string, conversationId: string) =>
    api(`/support/conversations/${conversationId}/messages/read`, { method: 'PATCH', token }),

  linkGuestToClient: (token: string, conversationId: string, userId: string) =>
    api(`/support/conversations/${conversationId}/link-client`, { method: 'PATCH', token, body: { user_id: userId } }),

  getStats: (token: string, type?: 'chat' | 'ticket') => {
    const qs = type ? `?type=${type}` : '';
    return api(`/support/conversations/stats${qs}`, { token });
  },

  getUnreadCount: (token: string, type?: 'chat' | 'ticket') => {
    const qs = type ? `?type=${type}` : '';
    return api(`/support/conversations/unread${qs}`, { token });
  },

  // ── GUEST (anonymous chat — no auth required) ──

  /**
   * Create a guest chat from the landing page.
   * No JWT required — uses HttpOnly cookie for session tracking.
   * The backend sets the cookie in the response.
   *
   * Ref: ROADMAP.md 7.4.2, 7.4.5
   */
  createGuestChat: async (data: { guest_name: string; guest_email?: string; body: string }) => {
    const res = await fetch(`${API_URL}/support/chats/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include', // Required for HttpOnly cookie
    });

    const json = await res.json();

    if (!res.ok) {
      throw {
        status: res.status,
        message: json.message || 'Error desconocido',
        correlationId: json.correlationId,
      };
    }

    return json as { conversation_id: string; subject: string; created_at: string; message: string };
  },
};


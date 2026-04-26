const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw {
      status: res.status,
      message: data.message || 'Error desconocido',
      correlationId: data.correlationId,
    };
  }

  return data as T;
}

// ── Auth API ──

export interface LoginResponse {
  requires_2fa?: boolean;
  temp_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
  user?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    status: string;
    role: { slug: string; name: string };
    last_login_at: string | null;
  };
}

export interface RegisterResponse {
  message: string;
  user_id: string;
}

export interface GenericResponse {
  message: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),

  verify2fa: (code: string, temp_token: string) =>
    api<LoginResponse>('/auth/verify-2fa', { method: 'POST', body: { code, temp_token } }),

  register: (data: { first_name: string; last_name: string; email: string; password: string }) =>
    api<RegisterResponse>('/auth/register', { method: 'POST', body: data }),

  verifyEmail: (token: string) =>
    api<GenericResponse>('/auth/verify-email', { method: 'POST', body: { token } }),

  resendVerification: (email: string) =>
    api<GenericResponse>('/auth/resend-verification', { method: 'POST', body: { email } }),

  forgotPassword: (email: string) =>
    api<GenericResponse>('/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (token: string, password: string) =>
    api<GenericResponse>('/auth/reset-password', { method: 'POST', body: { token, password } }),

  me: (token: string) =>
    api('/auth/me', { token }),

  logout: (token: string) =>
    api('/auth/logout', { method: 'POST', token }),

  refresh: (refresh_token: string) =>
    api<LoginResponse>('/auth/refresh', { method: 'POST', body: { refresh_token } }),
};

// ── Clients API ──

export const clientsApi = {
  list: (token: string, params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return api(`/clients${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/clients/${id}`, { token }),

  update: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/clients/${id}`, { method: 'PATCH', token, body: data }),

  addNote: (token: string, id: string, note: string) =>
    api(`/clients/${id}/notes`, { method: 'POST', token, body: { note } }),

  getBillingProfiles: (token: string, id: string) =>
    api(`/clients/${id}/billing-profiles`, { token }),

  createBillingProfile: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/clients/${id}/billing-profiles`, { method: 'POST', token, body: data }),

  updateBillingProfile: (token: string, userId: string, profileId: string, data: Record<string, unknown>) =>
    api(`/clients/${userId}/billing-profiles/${profileId}`, { method: 'PATCH', token, body: data }),

  deleteBillingProfile: (token: string, userId: string, profileId: string) =>
    api(`/clients/${userId}/billing-profiles/${profileId}`, { method: 'DELETE', token }),

  setDefaultBillingProfile: (token: string, userId: string, profileId: string) =>
    api(`/clients/${userId}/billing-profiles/${profileId}/default`, { method: 'PATCH', token }),

  // Structured notes (7.H19)
  listStructuredNotes: (token: string, userId: string, params?: { category?: string; pinned_only?: boolean; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.pinned_only) query.set('pinned_only', 'true');
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api(`/clients/${userId}/structured-notes${qs ? `?${qs}` : ''}`, { token });
  },

  createStructuredNote: (token: string, userId: string, data: { body: string; category?: string; conversation_id?: string; is_pinned?: boolean }) =>
    api(`/clients/${userId}/structured-notes`, { method: 'POST', token, body: data }),

  toggleNotePin: (token: string, noteId: string) =>
    api(`/clients/notes/${noteId}/pin`, { method: 'PATCH', token }),
};

// ── Products API ──

export const productsApi = {
  list: (token: string, params?: { page?: number; limit?: number; search?: string; status?: string; type?: string; category_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.category_id) query.set('category_id', params.category_id);
    const qs = query.toString();
    return api(`/products${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/products/${id}`, { token }),

  create: (token: string, data: Record<string, unknown>) =>
    api('/products', { method: 'POST', token, body: data }),

  update: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/products/${id}`, { method: 'PATCH', token, body: data }),

  toggleStatus: (token: string, id: string) =>
    api(`/products/${id}/status`, { method: 'PATCH', token }),

  delete: (token: string, id: string) =>
    api(`/products/${id}`, { method: 'DELETE', token }),

  // Pricing
  addPricing: (token: string, productId: string, data: Record<string, unknown>) =>
    api(`/products/${productId}/pricing`, { method: 'POST', token, body: data }),

  updatePricing: (token: string, pricingId: string, data: Record<string, unknown>) =>
    api(`/products/pricing/${pricingId}`, { method: 'PATCH', token, body: data }),

  deletePricing: (token: string, pricingId: string) =>
    api(`/products/pricing/${pricingId}`, { method: 'DELETE', token }),

  // Categories
  listCategories: (token: string) =>
    api('/products/categories/all', { token }),

  createCategory: (token: string, data: Record<string, unknown>) =>
    api('/products/categories', { method: 'POST', token, body: data }),

  updateCategory: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/products/categories/${id}`, { method: 'PATCH', token, body: data }),

  deleteCategory: (token: string, id: string) =>
    api(`/products/categories/${id}`, { method: 'DELETE', token }),
};

// ── Billing API ──

export const billingApi = {
  // Invoices
  listInvoices: (token: string, params?: { page?: number; limit?: number; search?: string; status?: string; user_id?: string; date_from?: string; date_to?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.user_id) query.set('user_id', params.user_id);
    if (params?.date_from) query.set('date_from', params.date_from);
    if (params?.date_to) query.set('date_to', params.date_to);
    const qs = query.toString();
    return api(`/billing/invoices${qs ? `?${qs}` : ''}`, { token });
  },

  getInvoice: (token: string, id: string) =>
    api(`/billing/invoices/${id}`, { token }),

  createInvoice: (token: string, data: Record<string, unknown>) =>
    api('/billing/invoices', { method: 'POST', token, body: data }),

  updateInvoice: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/billing/invoices/${id}`, { method: 'PATCH', token, body: data }),

  // State transitions
  finalizeInvoice: (token: string, id: string) =>
    api(`/billing/invoices/${id}/finalize`, { method: 'PATCH', token }),

  markAsPaid: (token: string, id: string, data?: Record<string, unknown>) =>
    api(`/billing/invoices/${id}/pay`, { method: 'PATCH', token, body: data }),

  markAsOverdue: (token: string, id: string) =>
    api(`/billing/invoices/${id}/overdue`, { method: 'PATCH', token }),

  cancelInvoice: (token: string, id: string) =>
    api(`/billing/invoices/${id}/cancel`, { method: 'PATCH', token }),

  refundInvoice: (token: string, id: string) =>
    api(`/billing/invoices/${id}/refund`, { method: 'PATCH', token }),

  // Stats
  getStats: (token: string) =>
    api('/billing/invoices/stats', { token }),

  // Checkout — userId comes from JWT. Admin can pass targetUserId for on-behalf checkout.
  checkout: (token: string, data: Record<string, unknown>, targetUserId?: string) =>
    api(`/billing/checkout${targetUserId ? `?targetUserId=${targetUserId}` : ''}`, { method: 'POST', token, body: data }),

  // PDF — fetch with auth and trigger download
  downloadPdf: async (token: string, id: string, invoiceNumber: string) => {
    const res = await fetch(`${API_URL}/billing/invoices/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Error descargando PDF');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};

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

  updateConversation: (token: string, id: string, data: { status?: string; priority?: string; category?: string; assigned_agent_id?: string; resolution_note?: string; tags?: string[] }) =>
    api(`/support/conversations/${id}`, { method: 'PATCH', token, body: data }),

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

// ── Tasks API ──

export const tasksApi = {
  list: (token: string, params?: {
    page?: number; limit?: number; status?: string; type?: string;
    priority?: string; assigned_to?: string; search?: string; time_range?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.assigned_to) query.set('assigned_to', params.assigned_to);
    if (params?.search) query.set('search', params.search);
    if (params?.time_range) query.set('time_range', params.time_range);
    const qs = query.toString();
    return api(`/tasks${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/tasks/${id}`, { token }),

  create: (token: string, data: Record<string, unknown>) =>
    api('/tasks', { method: 'POST', token, body: data }),

  update: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/tasks/${id}`, { method: 'PATCH', token, body: data }),

  complete: (token: string, id: string, data: { client_notes?: string; internal_notes?: string }) =>
    api(`/tasks/${id}/complete`, { method: 'PATCH', token, body: data }),

  delete: (token: string, id: string) =>
    api(`/tasks/${id}`, { method: 'DELETE', token }),

  getStats: (token: string) =>
    api('/tasks/stats', { token }),
};

// ── Dashboard API ──

export interface AdminOverview {
  role: 'admin';
  active_clients: number;
  total_revenue: number;
  overdue_invoices: number;
  pending_amount: number;
  open_tickets: number;
  open_chats: number;
  waiting_agent: number;
}

export interface ClientOverview {
  role: 'client';
  active_services: number;
  pending_invoice_amount: number;
  next_renewal: string | null;
  open_conversations: number;
}

export interface AgentOverview {
  role: 'agent';
  waiting_chats: number;
  unanswered_tickets: number;
  tasks_today: number;
}

export interface PartnerOverview {
  role: 'partner';
  referred_clients: number;
  commissions_this_month: number;
  next_settlement: string | null;
}

export type OverviewStats = AdminOverview | ClientOverview | AgentOverview | PartnerOverview;

export const dashboardApi = {
  getOverview: (token: string) =>
    api<OverviewStats>('/dashboard/overview', { token }),
};

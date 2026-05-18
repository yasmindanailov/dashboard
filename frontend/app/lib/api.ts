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

  // Resilencia frente a respuestas vacías:
  //   - HTTP 204 No Content (DELETE / no-content endpoints).
  //   - Handlers NestJS que devuelven `null`/`undefined` — se serializan
  //     como cuerpo vacío con `Content-Length: 0`, NO como `null` JSON.
  //   - 5xx con body vacío de un proxy.
  // En esos casos `res.json()` lanza "Unexpected end of JSON input" y
  // rompe todo el cliente. Leer el texto y parsear sólo si tiene contenido.
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown> | unknown[] | string | number | boolean | null) : null;

  if (!res.ok) {
    const errBody = (data ?? {}) as { message?: string; correlationId?: string };
    throw {
      status: res.status,
      message: errBody.message || 'Error desconocido',
      correlationId: errBody.correlationId,
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

  /**
   * Sprint 13.5 Fase E (DC.15) — fuente única de verdad para los permisos
   * del usuario actual. Devuelve `{ role, sidebar_subjects, actions_by_subject,
   * all_subjects_with_rules }`. El frontend puede usarlo para hidratar
   * `AuthContext` y eliminar el drift respecto a `lib/permissions.ts`
   * hardcoded. Cierre canónico en Sprint 13 §13.AUTH (SC nativo + cookies).
   */
  myPermissions: (token: string) =>
    api<{
      role: string;
      sidebar_subjects: string[];
      actions_by_subject: Record<string, string[]>;
      all_subjects_with_rules: string[];
    }>('/auth/me/permissions', { token }),

  logout: (token: string) =>
    api('/auth/logout', { method: 'POST', token }),

  refresh: (refresh_token: string) =>
    api<LoginResponse>('/auth/refresh', { method: 'POST', body: { refresh_token } }),
};

// ── Clients API (Sprint 9.6 + ADR-068: path canónico /admin/clients/*) ──
// El backend mantiene `/clients/*` como alias legacy con headers Deprecation
// hasta el cierre Sprint 14. Aquí ya apuntamos al canónico para evitar
// las advertencias de deprecación en runtime.

export const clientsApi = {
  list: (token: string, params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return api(`/admin/clients${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/admin/clients/${id}`, { token }),

  update: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/admin/clients/${id}`, { method: 'PATCH', token, body: data }),

  addNote: (token: string, id: string, note: string) =>
    api(`/admin/clients/${id}/notes`, { method: 'POST', token, body: { note } }),

  getBillingProfiles: (token: string, id: string) =>
    api(`/admin/clients/${id}/billing-profiles`, { token }),

  createBillingProfile: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/admin/clients/${id}/billing-profiles`, { method: 'POST', token, body: data }),

  updateBillingProfile: (token: string, userId: string, profileId: string, data: Record<string, unknown>) =>
    api(`/admin/clients/${userId}/billing-profiles/${profileId}`, { method: 'PATCH', token, body: data }),

  deleteBillingProfile: (token: string, userId: string, profileId: string) =>
    api(`/admin/clients/${userId}/billing-profiles/${profileId}`, { method: 'DELETE', token }),

  setDefaultBillingProfile: (token: string, userId: string, profileId: string) =>
    api(`/admin/clients/${userId}/billing-profiles/${profileId}/default`, { method: 'PATCH', token }),

  /* Structured notes — Sprint 16 / ADR-079 §3.8.
     Filtros canónicos: `category` (NoteCategory enum), `source_system`
     (NoteSourceSystem enum), `pinned_only`. */
  listStructuredNotes: (
    token: string,
    userId: string,
    params?: {
      category?: string;
      source_system?: string;
      pinned_only?: boolean;
      page?: number;
      limit?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.source_system) query.set('source_system', params.source_system);
    if (params?.pinned_only) query.set('pinned_only', 'true');
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api(`/admin/clients/${userId}/structured-notes${qs ? `?${qs}` : ''}`, { token });
  },

  /* ADR-079 §3.8: única vía pública de creación de nota es la EXCEPCIONAL.
     El resto de notas las crean los listeners canónicos al cerrar
     ticket / mantenimiento / task. */
  createExceptionalNote: (
    token: string,
    userId: string,
    data: { body: string; is_pinned?: boolean },
  ) =>
    api(`/admin/clients/${userId}/structured-notes`, {
      method: 'POST',
      token,
      body: data,
    }),

  toggleNotePin: (token: string, noteId: string) =>
    api(`/admin/clients/notes/${noteId}/pin`, { method: 'PATCH', token }),
};

// ── Products API (Sprint 9.6 + ADR-068) ──
// Lectura del catálogo (`list`, `get`, `listCategories`) → endpoint canónico
// público bajo `/products` (cliente puede leer en CASL `Read.Product`,
// preparado para Sprint 18 Landing).
// Mutaciones (`create/update/delete/pricing/categories mutaciones`) →
// endpoint canónico admin bajo `/admin/products`. El backend mantiene
// `/products/*` como alias legacy con headers Deprecation hasta Sprint 14.

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
    api('/admin/products', { method: 'POST', token, body: data }),

  update: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/admin/products/${id}`, { method: 'PATCH', token, body: data }),

  toggleStatus: (token: string, id: string) =>
    api(`/admin/products/${id}/status`, { method: 'PATCH', token }),

  delete: (token: string, id: string) =>
    api(`/admin/products/${id}`, { method: 'DELETE', token }),

  // Pricing — todas son mutaciones admin
  addPricing: (token: string, productId: string, data: Record<string, unknown>) =>
    api(`/admin/products/${productId}/pricing`, { method: 'POST', token, body: data }),

  updatePricing: (token: string, pricingId: string, data: Record<string, unknown>) =>
    api(`/admin/products/pricing/${pricingId}`, { method: 'PATCH', token, body: data }),

  deletePricing: (token: string, pricingId: string) =>
    api(`/admin/products/pricing/${pricingId}`, { method: 'DELETE', token }),

  // Categories — lectura pública, mutaciones admin
  listCategories: (token: string) =>
    api('/products/categories/all', { token }),

  createCategory: (token: string, data: Record<string, unknown>) =>
    api('/admin/products/categories', { method: 'POST', token, body: data }),

  updateCategory: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/admin/products/categories/${id}`, { method: 'PATCH', token, body: data }),

  deleteCategory: (token: string, id: string) =>
    api(`/admin/products/categories/${id}`, { method: 'DELETE', token }),
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

  // PDF — pedir signed URL (auth Bearer) y luego descargar directo del bucket.
  // Two-phase para evitar CORS preflight cross-origin contra MinIO/S3.
  // Ver ADR-062 §H y `billing.controller.ts` (`/pdf-url` vs `/pdf`).
  downloadPdf: async (token: string, id: string, invoiceNumber: string) => {
    const { url } = await api<{ url: string; filename: string }>(
      `/billing/invoices/${id}/pdf-url`,
      { token },
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

// ── Users API (Sprint 8 Fase A — listar agentes asignables) ──
//
// Endpoint admin-only que el NewTaskModal y DetailPage usan para resolver
// el selector de "Asignar a". El backend filtra por `ASSIGNABLE_ROLE_SLUGS`
// (superadmin + 3 agentes); los `client`/`partner` nunca aparecen aquí
// (defense-in-depth).

export const usersApi = {
  listAgents: (
    token: string,
    params?: {
      role?: string | string[];
      search?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.role) {
      const roles = Array.isArray(params.role) ? params.role : [params.role];
      roles.forEach((r) => query.append('role', r));
    }
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api(`/admin/users${qs ? `?${qs}` : ''}`, { token });
  },
};

// ── Tasks API ──

/* ═══════════════════════════════════════
   tasksApi — contrato canónico Sprint 16 / ADR-079.
   Bridge unidireccional read-only. Endpoints disponibles:
     GET    /tasks
     GET    /tasks/stats
     GET    /tasks/:id
     PATCH  /tasks/:id/assign
     PATCH  /tasks/:id/complete                 (no-bridge: nota obligatoria)
     PATCH  /tasks/:id/complete-ticket-bridge   (bridge ticket↔task)
     PATCH  /tasks/:id/cancel
     GET    /tasks/:id/checklist
     POST   /tasks/:id/checklist/complete
     POST   /tasks/:id/maintenance/log
     GET    /tasks/:id/notes
   No existe POST /tasks ni PATCH /tasks/:id libre. Doctrina §1 ADR-079.
   ═══════════════════════════════════════ */

export type TaskScope = 'mine' | 'unassigned' | 'all';
export type TaskTicketAction = 'resolve' | 'close';

export const tasksApi = {
  list: (token: string, params?: {
    page?: number;
    limit?: number;
    scope?: TaskScope;
    status?: string;
    /** Filtra por sistema vinculado. Sustituye al legacy `type`. */
    source_system?: string;
    priority?: string;
    assigned_to?: string;
    client_id?: string;
    /** Filtra por origen vinculado (conversation_id|slot_id|service_id|...). */
    source_id?: string;
    time_range?: 'today' | 'week' | 'all';
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.scope) query.set('scope', params.scope);
    if (params?.status) query.set('status', params.status);
    if (params?.source_system) query.set('source_system', params.source_system);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.assigned_to) query.set('assigned_to', params.assigned_to);
    if (params?.client_id) query.set('client_id', params.client_id);
    if (params?.source_id) query.set('source_id', params.source_id);
    if (params?.time_range) query.set('time_range', params.time_range);
    const qs = query.toString();
    return api(`/tasks${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/tasks/${id}`, { token }),

  getStats: (token: string, scope?: TaskScope) => {
    const qs = scope ? `?scope=${scope}` : '';
    return api(`/tasks/stats${qs}`, { token });
  },

  /** Asignar / reasignar / liberar a cola pública. ADR-079 §3.10. */
  assign: (token: string, id: string, assigned_to: string | null) =>
    api(`/tasks/${id}/assign`, {
      method: 'PATCH',
      token,
      body: { assigned_to },
    }),

  /** Completar task no-bridge. Nota obligatoria — persiste en
      `client_notes` con `source_system='task_completion'`. */
  complete: (token: string, id: string, note: string) =>
    api(`/tasks/${id}/complete`, {
      method: 'PATCH',
      token,
      body: { note },
    }),

  /** Completar bridge ticket↔task. Delega en module support para resolver/
      cerrar el ticket vinculado y notificar al cliente. */
  completeTicketBridge: (
    token: string,
    id: string,
    data: { ticket_action: TaskTicketAction; resolution_note: string },
  ) =>
    api(`/tasks/${id}/complete-ticket-bridge`, {
      method: 'PATCH',
      token,
      body: data,
    }),

  /* Sprint 16 / ADR-079 amendment A2: la cancelación humana de tasks queda
     eliminada de la UI. La cancelación canónica la disparan los listeners
     cross-sistema del backend (slot liberado, servicio cancelado, ticket
     desasignado, item del checklist eliminado). El método `tasksApi.cancel`
     legacy quedó retirado del cliente; el endpoint `PATCH /tasks/:id/cancel`
     sigue existiendo en backend marcado @deprecated solo para superadmin
     debug. Vía canónica de "cambiar de manos": `tasksApi.assign`. */

  /** Checklist + maintenance log (preservado de Sprint 8 Fase B.5). */
  getChecklist: (token: string, taskId: string) =>
    api(`/tasks/${taskId}/checklist`, { token }),

  completeChecklistItem: (
    token: string,
    taskId: string,
    data: {
      item_id: string;
      item_kind: 'service' | 'product';
      notes?: string;
    },
  ) =>
    api(`/tasks/${taskId}/checklist/complete`, {
      method: 'POST',
      token,
      body: data,
    }),

  /** Cierra task de mantenimiento (`source_system='support_inside_slot'`).
      `client_facing_notes` = email al cliente; `internal_notes` opcional →
      `client_notes` con `source_system='maintenance_log'`. ADR-079 §3.8. */
  recordMaintenanceLog: (
    token: string,
    taskId: string,
    data: {
      client_facing_notes: string;
      internal_notes?: string;
      month_year?: string;
      checklist_completions?: {
        item_id: string;
        item_kind: 'service' | 'product';
        notes?: string;
      }[];
    },
  ) =>
    api(`/tasks/${taskId}/maintenance/log`, {
      method: 'POST',
      token,
      body: data,
    }),

  /** Notas vinculadas a la task (`source_system='task_completion'`). */
  listNotes: (token: string, taskId: string) =>
    api<TaskNotePayload[]>(`/tasks/${taskId}/notes`, { token }),
};

export interface TaskNotePayload {
  id: string;
  body: string;
  created_at: string;
  category?: string;
  source_system?: string;
  triggered_by_action?: string | null;
  author: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

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
  // Sub-fase 8.D.12.7 — Support Inside transversal en overview.
  support_inside: {
    product_name: string;
    product_slug: string;
    priority_tier: 'standard' | 'high' | 'max';
    response_sla_hours: number;
    slots_included: number;
    slots_used: number;
  } | null;
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

// ── Admin / Error Log (Sprint 9 Fase F) ──

export interface ErrorLogItem {
  id: string;
  level: string;
  module: string;
  message: string;
  correlation_id: string | null;
  user_id: string | null;
  request_path: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ErrorLogListResponse {
  data: ErrorLogItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const errorLogApi = {
  list: (
    token: string,
    params?: {
      level?: string;
      module?: string;
      resolved?: boolean;
      page?: number;
      limit?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.level) query.set('level', params.level);
    if (params?.module) query.set('module', params.module);
    if (params?.resolved !== undefined)
      query.set('resolved', String(params.resolved));
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api<ErrorLogListResponse>(`/admin/error-log${qs ? `?${qs}` : ''}`, {
      token,
    });
  },
  resolve: (token: string, id: string) =>
    api<{ resolved: true }>(`/admin/error-log/${id}/resolve`, {
      method: 'PATCH',
      token,
    }),
};

// ── Audit / Transparency (Sprint 9 Fase E) ──

export interface AuditAccessItem {
  id: string;
  user_id: string;
  action: string;
  ip_address: string;
  user_agent: string | null;
  resource: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: {
    first_name: string | null;
    last_name: string | null;
    role_name: string;
  } | null;
}

export interface AuditAccessListResponse {
  data: AuditAccessItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const auditApi = {
  myAccessLog: (
    token: string,
    params?: { page?: number; limit?: number },
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api<AuditAccessListResponse>(`/audit/access${qs ? `?${qs}` : ''}`, {
      token,
    });
  },
};

// ── Notifications (Sprint 9.5 — campana cliente) ──

export type NotificationChannel = 'internal' | 'email' | 'whatsapp' | 'push';

export interface NotificationItem {
  id: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  sent_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UnreadNotificationsResponse {
  data: NotificationItem[];
  unread_count: number;
}

export interface NotificationsListResponse {
  data: NotificationItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const notificationsApi = {
  unread: (token: string) =>
    api<UnreadNotificationsResponse>('/notifications/unread', { token }),

  list: (
    token: string,
    params?: { page?: number; limit?: number; unread_only?: boolean },
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.unread_only) query.set('unread_only', 'true');
    const qs = query.toString();
    return api<NotificationsListResponse>(
      `/notifications${qs ? `?${qs}` : ''}`,
      { token },
    );
  },

  markRead: (token: string, id: string) =>
    api<{ read: true }>(`/notifications/${id}/read`, {
      method: 'PATCH',
      token,
    }),

  markAllRead: (token: string) =>
    api<{ updated: number }>('/notifications/read-all', {
      method: 'PATCH',
      token,
    }),
};

// ── Admin / Notification Templates (Sprint 9.5) ──

export interface NotificationTemplateItem {
  id: string;
  event_type: string;
  channel: NotificationChannel;
  locale: string;
  subject: string;
  body: string;
  variables: Record<string, unknown> | null;
  active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplatesListResponse {
  data: NotificationTemplateItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface NotificationTemplatePreviewResponse {
  event_type: string;
  subject: string;
  body: string;
}

export const notificationTemplatesApi = {
  list: (
    token: string,
    params?: {
      event_type?: string;
      channel?: NotificationChannel;
      page?: number;
      limit?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.event_type) query.set('event_type', params.event_type);
    if (params?.channel) query.set('channel', params.channel);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api<NotificationTemplatesListResponse>(
      `/admin/notifications/templates${qs ? `?${qs}` : ''}`,
      { token },
    );
  },

  get: (token: string, id: string) =>
    api<NotificationTemplateItem>(`/admin/notifications/templates/${id}`, {
      token,
    }),

  update: (
    token: string,
    id: string,
    data: { subject?: string; body?: string; active?: boolean },
  ) =>
    api<{ id: string }>(`/admin/notifications/templates/${id}`, {
      method: 'PATCH',
      token,
      body: data,
    }),

  preview: (
    token: string,
    id: string,
    payload?: Record<string, unknown>,
  ) =>
    api<NotificationTemplatePreviewResponse>(
      `/admin/notifications/templates/${id}/preview`,
      { method: 'POST', token, body: payload ? { payload } : {} },
    ),
};

// ── Admin / Plugins (Sprint 15A — ADR-080) ──
//
// Endpoints `/api/v1/admin/plugins` para que el superadmin gestione la
// configuración de los plugins de provisioning (enabled, config, secrets
// cifrados, test-connection). Solo accesible vía Server Components +
// Server Actions con cookies httpOnly Modelo A (ADR-078). NO se exponen
// estos tipos al cliente.

export type PluginSettingsCategory =
  | 'provisioner'
  | 'payment'
  | 'notification'
  | 'ai';

export type PluginTestConnectionMethod = 'getStatus' | 'custom' | null;

export type PluginCircuitState = 'closed' | 'open' | 'half-open';

/**
 * Sprint 15C.II Fase F.11.1 (R3 frozen §A.11.10.8.2) — agregado canónico
 * de salud del plugin in-process del service, expuesto en
 * `GET /admin/services/:id/plugin-health`.
 *
 * Doctrina:
 *   - `operational` — todos los breakers cerrados (o sin breakers
 *     registrados — operaciones cross-cutting nunca invocadas).
 *   - `degraded`   — al menos un breaker `half-open`, ninguno `open`.
 *   - `down`       — al menos un breaker `open`.
 *
 * El badge dice "estado en esta instancia" — el breaker es in-process
 * (ADR-080 §5). Read-only — no crea breakers ni invoca al plugin.
 */
export type PluginHealthState = 'operational' | 'degraded' | 'down';

export interface PluginHealthBreaker {
  /** Operación sin prefijo del slug (`getServiceInfo`, `executeAction`, ...). */
  operation: string;
  state: PluginCircuitState;
}

export interface PluginHealthSummary {
  pluginSlug: string;
  state: PluginHealthState;
  breakers: PluginHealthBreaker[];
}

/**
 * Subset acotado de JSON-Schema 7 que el backend declara en
 * `core/provisioning/types.ts §12`. Mantener sincronizado al añadir
 * formats/keywords nuevos al backend.
 */
export interface PluginJsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'integer';
  // Sprint 15C.II Fase B fix-up (2026-05-10): el plugin manifest declara
  // `title` y `description` por property; ambos son i18n keys que el frontend
  // resuelve via translateSchema() + el widget DS los renderiza como
  // <label> + helperText respectivamente.
  title?: string; // i18n key (rjsf usa esto como label)
  description?: string; // i18n key (rjsf lo mapea a options.help → DS Input helperText)
  format?: 'uri' | 'email' | 'password' | 'uuid';
  enum?: ReadonlyArray<string | number>;
  default?: string | number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

export interface PluginJsonSchema {
  type: 'object';
  properties: Record<string, PluginJsonSchemaProperty>;
  required?: ReadonlyArray<string>;
  additionalProperties?: false;
}

export interface PluginManifest {
  slug: string;
  version: string;
  manifestVersion: 'v1';
  label: string;
  description: string;
  docsUrl: string;
  settingsCategory: PluginSettingsCategory;
  configSchema: PluginJsonSchema;
  secretsSchema: PluginJsonSchema;
  testConnectionMethod: PluginTestConnectionMethod;
  /**
   * Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B (2026-05-09).
   *
   * Schema declarativo del shape de `Product.provisioner_config` para
   * productos que provisionan a través de este plugin. Renderizado por
   * `@rjsf/core` en el form admin de productos. Opcional — plugins
   * triviales (`internal`, `manual`) lo omiten.
   *
   * Ver canonical en `backend/src/core/provisioning/types.ts §12`.
   */
  productConfigSchema?: PluginJsonSchema;
}

export interface PluginCircuitStateSummary {
  getServiceInfo: PluginCircuitState | null;
  executeAction: PluginCircuitState | null;
}

/** Item devuelto por `GET /admin/plugins` (lista). */
export interface AdminPluginListItem {
  slug: string;
  manifest: PluginManifest | null;
  enabled: boolean;
  updated_at: string | null;
  circuit_state: PluginCircuitStateSummary;
}

/**
 * Detalle devuelto por `GET /admin/plugins/:slug`.
 * `secrets` es un mapa `{ <field>: '***' | null }` — '***' si está seteado,
 * null si no. Los plaintexts NUNCA salen del backend (R12 + ADR-080 §3).
 */
export interface AdminPluginDetail {
  slug: string;
  manifest: PluginManifest;
  enabled: boolean;
  installed_at: string | null;
  updated_at: string | null;
  config: Record<string, unknown>;
  secrets: Record<string, '***' | null>;
  circuit_state: PluginCircuitStateSummary;
}

/**
 * Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría per-servicio.
 * Espejo de `ServiceTimelinePage`/`ServiceTimelineEntry` del backend
 * (`modules/audit/dto/service-timeline.dto.ts`). En vista cliente,
 * `changes_*`/`correlation_id`/`ip_address` vienen `undefined` (recorte GDPR)
 * y `metadata` es un subconjunto cliente-seguro por acción.
 */
export type ServiceTimelineSource = 'change' | 'access';

export interface ServiceTimelineActor {
  user_id: string | null;
  name: string | null;
  role: string | null;
}

export interface ServiceTimelineEntry {
  id: string;
  source: ServiceTimelineSource;
  action: string;
  actor: ServiceTimelineActor | null;
  created_at: string;
  changes_before?: unknown;
  changes_after?: unknown;
  correlation_id?: string | null;
  ip_address?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ServiceTimelinePage {
  items: ServiceTimelineEntry[];
  next_cursor: string | null;
}

export type PluginHealthStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'disabled';

export type PluginReconcileChangeType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

/**
 * Devuelto por `GET /admin/plugins/:slug/operational-overview` — Sprint 15C.II
 * Fase F.2 (ADR-083 Amendment A4.4). Shape plugin-agnóstico; espejo de
 * `PluginOperationalOverview` del backend
 * (`modules/admin-plugins/dto/plugin-operational-overview.dto.ts`).
 * `circuit.*` es estado in-process — la UI lo etiqueta como tal.
 */
export interface PluginOperationalOverview {
  slug: string;
  /** i18n key (de `manifest.label`). */
  label: string;
  enabled: boolean;
  health: {
    status: PluginHealthStatus;
    /** i18n keys que explican el estado (≥1). */
    reasons: string[];
  };
  circuit: PluginCircuitStateSummary;
  secrets: {
    required: number;
    configured: number;
    missing: string[];
  };
  services: {
    active: number;
    suspended: number;
  };
  reconciliation: {
    supported: boolean;
    /**
     * Sprint 15C.II Fase F.9 (R9 frozen §A.11.10.6.2 Amendment III): el
     * backend deriva este flag de `reconcileRegistry.hasReconcileOneExecutor(slug)`.
     * El frontend lo lee para gatear el CTA "Reconciliar contra el proveedor"
     * (AdminDriftBanner + filas drift de PluginOperationalOverview). Espejo
     * del DTO backend `plugin-operational-overview.dto.ts`. Coherente con
     * capability-driven por presencia A6/A7 — NO en PluginManifest.
     */
    supports_reconcile_one: boolean;
    last: {
      completed_at: string;
      trigger: 'cron' | 'manual';
      services_processed: number;
      drifts_detected: number;
      errors: number;
    } | null;
    next_scheduled_at: string | null;
    drifts_24h: number;
  };
  recent_drifts: Array<{
    service_id: string;
    change_type: PluginReconcileChangeType;
    detected_at: string;
  }>;
  generated_at: string;
}

/** Body de `PATCH /admin/plugins/:slug`. Todos los campos opcionales. */
export interface AdminPluginUpdateBody {
  enabled?: boolean;
  config?: Record<string, unknown>;
  /** plaintexts — el backend los cifra antes de persistir. */
  secrets?: Record<string, string>;
}

export interface AdminPluginUpdateResponse {
  slug: string;
  enabled: boolean;
  updated_at: string;
}

export interface AdminPluginTestConnectionResponse {
  success: boolean;
  message: string;
  checked_at: string;
}

// ── Support Inside (Sprint 8 Fase D — ADR-061 + ADR-075) ──
//
// Cliente: `/api/v1/dashboard/support-inside/*` (catálogo público + suscripción).
// Admin:   `/api/v1/admin/support-inside/plans` (índice + editor por slug).

export type SupportInsideSlotType = 'maintenance' | 'maintenance_management';
export type SupportInsideChannel = 'webchat' | 'email' | 'phone' | 'whatsapp';
// ProductType del schema Prisma (mismos valores). Sub-fase 8.D.12.
export type ProductTypeSlug =
  | 'hosting_web'
  | 'domain'
  | 'docker_service'
  | 'support_inside'
  | 'we_do_it'
  | 'custom_service';
export type SupportInsidePriorityTier = 'standard' | 'high' | 'max';
export type SupportInsideCtaVisibility =
  | 'hidden'
  | 'catalog_banner'
  | 'landing_cta';
export type SupportInsideStatus = 'active' | 'cancelled' | 'past_due';
export type ProductStatus = 'active' | 'inactive' | 'deprecated';

export interface SupportInsidePublicPlan {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  badge_text: string | null;
  order_index: number;
  pricing: {
    monthly: {
      product_pricing_id: string;
      price: string;
      currency: string;
    } | null;
    yearly: {
      product_pricing_id: string;
      price: string;
      currency: string;
      discount_percentage: string | null;
    } | null;
  };
  config: {
    slots_included: number;
    slot_types_allowed: SupportInsideSlotType[];
    applicable_product_types: ProductTypeSlug[];
    extra_slot_price: string;
    channels_active: SupportInsideChannel[];
    priority_tier: SupportInsidePriorityTier;
    response_sla_hours: number;
  } | null;
}

export interface SupportInsideSlotPayload {
  id: string;
  subscription_id: string;
  service_id: string;
  slot_type: SupportInsideSlotType;
  is_extra: boolean;
  assigned_at: string;
  released_at: string | null;
  service?: {
    id: string;
    label: string | null;
    domain: string | null;
    status: string;
    product: { name: string };
  };
}

export interface SupportInsideSubscriptionPayload {
  id: string;
  client_id: string;
  product_id: string;
  service_id: string;
  status: SupportInsideStatus;
  started_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  product: {
    id: string;
    slug: string;
    name: string;
    short_description: string | null;
    support_inside_config: {
      slots_included: number;
      slot_types_allowed: SupportInsideSlotType[];
      applicable_product_types: ProductTypeSlug[];
      extra_slot_price: string;
      channels_active: SupportInsideChannel[];
      priority_tier: SupportInsidePriorityTier;
      response_sla_hours: number;
    } | null;
  };
  service: {
    id: string;
    status: string;
    next_due_date: string | null;
  };
  slots: SupportInsideSlotPayload[];
}

export interface SupportInsideAdminPlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  status: ProductStatus;
  slots_included: number;
  pricing_monthly: string | null;
  pricing_yearly: string | null;
  currency: string;
  updated_at: string;
}

export interface SupportInsideAdminPricing {
  id: string;
  billing_cycle: string;
  currency: string;
  price: string;
  setup_fee: string;
  discount_percentage: string | null;
  active: boolean;
}

export interface SupportInsideAdminPlanDetail {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  status: ProductStatus;
  badge_text: string | null;
  partner_commission_pct: string | null;
  updated_at: string;
  support_inside_config: {
    slots_included: number;
    slot_types_allowed: SupportInsideSlotType[];
    applicable_product_types: ProductTypeSlug[];
    extra_slot_price: string;
    channels_active: SupportInsideChannel[];
    priority_tier: SupportInsidePriorityTier;
    response_sla_hours: number;
    cta_visibility: SupportInsideCtaVisibility;
  } | null;
  pricing: SupportInsideAdminPricing[];
}

export interface SupportInsidePlanPatch {
  // Identidad
  name?: string;
  description?: string | null;
  short_description?: string | null;
  status?: ProductStatus;
  // Precios
  pricing?: {
    monthly?: {
      price: number;
      setup_fee?: number;
      currency?: string;
      discount_percentage?: number | null;
      active?: boolean;
    };
    annual?: {
      price: number;
      setup_fee?: number;
      currency?: string;
      discount_percentage?: number | null;
      active?: boolean;
    };
  };
  // Slots
  slots_included?: number;
  slot_types_allowed?: SupportInsideSlotType[];
  applicable_product_types?: ProductTypeSlug[];
  extra_slot_price?: number;
  // Soporte
  channels_active?: SupportInsideChannel[];
  priority_tier?: SupportInsidePriorityTier;
  response_sla_hours?: number;
  // Avanzada
  partner_commission_pct?: number;
  cta_visibility?: SupportInsideCtaVisibility;
}

export interface SupportInsideEligibleService {
  id: string;
  label: string | null;
  domain: string | null;
  status: string;
  product_name: string;
  product_type: string;
}

export const supportInsideApi = {
  // ─── Cliente ──
  listPlans: (token: string) =>
    api<SupportInsidePublicPlan[]>('/dashboard/support-inside/plans', { token }),

  listEligibleServices: (token: string) =>
    api<SupportInsideEligibleService[]>(
      '/dashboard/support-inside/eligible-services',
      { token },
    ),

  getStatus: (token: string) =>
    api<SupportInsideSubscriptionPayload | null>(
      '/dashboard/support-inside/status',
      { token },
    ),

  subscribe: (
    token: string,
    data: { product_pricing_id: string; billing_profile_id?: string },
  ) =>
    api<{
      subscription: SupportInsideSubscriptionPayload;
      service: { id: string };
      invoice: { id: string };
    }>('/dashboard/support-inside/subscribe', {
      method: 'POST',
      token,
      body: data,
    }),

  cancel: (token: string, data: { reason?: string }) =>
    api<{ cancelled: true; released_slots: number }>(
      '/dashboard/support-inside/subscription',
      { method: 'DELETE', token, body: data },
    ),

  addSlot: (
    token: string,
    data: {
      service_id: string;
      slot_type: SupportInsideSlotType;
      is_extra?: boolean;
    },
  ) =>
    api<SupportInsideSlotPayload>('/dashboard/support-inside/slots', {
      method: 'POST',
      token,
      body: data,
    }),

  releaseSlot: (token: string, slotId: string) =>
    api<{ released: true }>(`/dashboard/support-inside/slots/${slotId}`, {
      method: 'DELETE',
      token,
    }),

  // ─── Admin ──
  adminList: (token: string) =>
    api<SupportInsideAdminPlanRow[]>('/admin/support-inside/plans', { token }),

  adminGet: (token: string, slug: string) =>
    api<SupportInsideAdminPlanDetail>(
      `/admin/support-inside/plans/${slug}`,
      { token },
    ),

  adminUpdate: (token: string, slug: string, data: SupportInsidePlanPatch) =>
    api<SupportInsideAdminPlanDetail>(
      `/admin/support-inside/plans/${slug}`,
      { method: 'PATCH', token, body: data },
    ),
};

// ── Admin / Jobs (Sprint 9 Fase F) ──

export interface FailedJobItem {
  id: string;
  bull_job_id: string;
  queue: string;
  name: string;
  last_error: string;
  attempts_made: number;
  status: 'failed' | 'retrying' | 'resolved';
  retried_at: string | null;
  retried_by: string | null;
  created_at: string;
}

export interface FailedJobsListResponse {
  data: FailedJobItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const jobsApi = {
  listFailed: (
    token: string,
    params?: { queue?: string; status?: string; page?: number; limit?: number },
  ) => {
    const query = new URLSearchParams();
    if (params?.queue) query.set('queue', params.queue);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api<FailedJobsListResponse>(`/admin/jobs/failed${qs ? `?${qs}` : ''}`, {
      token,
    });
  },
  retry: (token: string, id: string) =>
    api<{ retried: true }>(`/admin/jobs/${id}/retry`, {
      method: 'POST',
      token,
    }),
};

// ─── Services API (Sprint 11 Fase 11.D — ADR-070 + ADR-077) ─────────
//
// Cliente: 4 endpoints (`GET /services`, `GET /services/:id`,
// `POST /services/:id/sso`, `POST /services/:id/actions/:slug`).
// Admin: 3 endpoints (`GET /admin/services`, `POST /admin/services/:id/reprovision`,
// `POST /admin/services/:id/deprovision`).
//
// Shapes alineados con `backend/src/core/provisioning/types.ts` (ADR-077 §1+§2).

export interface ServiceListItem {
  id: string;
  user_id: string;
  status: string;
  label: string | null;
  domain: string | null;
  provisioner_slug: string | null;
  provider_reference: string | null;
  created_at: string;
  product: {
    id: string;
    slug: string;
    name: string;
    type: string;
    provisioner: string;
  };
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

export interface ServiceListResponse {
  data: ServiceListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ServiceInfoCapabilities {
  has_sso_panel: boolean;
  panel_label?: string;
  has_metrics: boolean;
  has_metrics_history: boolean;
  requires_server: boolean;
  provision_mode: 'sync' | 'async';
  completes_via_task: boolean;
  supports_reconciliation: boolean;
  /**
   * Sprint 15C Fase A — ADR-077 Amendment A1 + ADR-082 §3.
   * `true` si el plugin gestiona la zona DNS authoritative del service.
   * Frontend ramifica por este flag (NUNCA por slug) — Sprint 15C Fase G
   * añade el link "Gestionar DNS" condicional en `/dashboard/services/[id]`.
   */
  has_dns_management: boolean;
  /**
   * Sprint 15C.II Fase F — ADR-077 Amendment A4. `true` si el plugin soporta
   * suspender / reactivar el servicio sin desprovisionarlo. La UI admin
   * ramifica por este flag (NUNCA por slug) para ofrecer "Suspender / Reanudar
   * servicio" en `AdminServiceOperationsCard`. Implícitamente, los plugins con
   * `supports_suspend=true` exponen las inline actions `suspend_service` (si
   * `status='active'`) / `unsuspend_service` (si `status='suspended'`) en
   * `availableActions` — ocultas en `ActionsBar` (`INTERNAL_HELPER_SLUGS`),
   * operadas desde la card de operaciones admin.
   */
  supports_suspend: boolean;
  hasSsoPanel: boolean;
  inlineActions: ServiceAction[];
}

/**
 * Sprint 15C.II Fase F — ADR-077 Amendment A4. Taxonomía canónica del motivo
 * de una suspensión administrativa (cliente-segura — la UI muestra la etiqueta
 * localizada `service.suspension_reason.<reason>`, NUNCA la nota interna del
 * admin). DEBE coincidir con el tipo `SuspensionReason` del backend.
 */
export type SuspensionReason =
  | 'overdue_payment'
  | 'abuse_investigation'
  | 'scheduled_maintenance'
  | 'gdpr_restriction'
  | 'other';

export interface ServiceAction {
  slug: string;
  label: string;
  description?: string;
  confirmRequired: boolean;
  confirmationText?: string;
  destructive: boolean;
  /**
   * Sprint 15C Fase 15C.E (ADR-077 Amendment A3 + ADR-083 Amendment A3).
   *
   * Si `true`, la acción solo es invocable por usuarios con rol staff
   * (`superadmin` / `agent_full` / `agent_billing` / `agent_support`).
   * Backend wrapper enforce HTTP 403 + audit + evento
   * `service.action_admin_only_violation` (defense-in-depth).
   *
   * Frontend filtra `actions` por `!a.adminOnly || isAdmin` antes de
   * renderizar — el cliente no-admin ni siquiera ve el botón.
   *
   * Ortogonal a `destructive`. Default `false` (client-callable).
   */
  adminOnly?: boolean;
  payloadSchema?: Record<string, unknown>;
}

export interface ServiceMetrics {
  diskUsedMb?: number;
  diskTotalMb?: number;
  bandwidthUsedMb?: number;
  bandwidthTotalMb?: number;
  ramUsedMb?: number;
  ramTotalMb?: number;
  cpuUsagePercent?: number;
  emailAccountsUsed?: number;
  emailAccountsTotal?: number;
  databasesUsed?: number;
  databasesTotal?: number;
  custom?: Record<string, string | number>;
  fetchedAt: string;
}

/**
 * Sprint 15C.II Fase E — ADR-077 Amendment A5. Pista de recuperación
 * canónica que el plugin emite cuando `status` ∈ {`unknown`, `failed`,
 * `suspended`, `expired`} (drift). La UI ramifica por este valor para
 * ofrecer el CTA de remediación correcto — NUNCA matchea `statusReason`
 * por string (eso es i18n display, no contrato de comportamiento).
 *   - `reprovision`     → recurso ausente en el proveedor → botón "Re-aprovisionar".
 *   - `reconcile`       → metadata local divergió → re-sync del cron L3 manual.
 *   - `contact_support` → drift no auto-remediable → sin CTA accionable.
 */
export type ServiceRecoveryHint = 'reprovision' | 'reconcile' | 'contact_support';

/**
 * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7. Estado canónico del
 * certificado SSL/TLS del recurso. La UI ramifica por este valor (NUNCA
 * por matching de strings sobre `issuer` ni por aritmética de fechas en
 * cliente — eso vive server-side en el plugin).
 */
export type ServiceSslStatus = 'valid' | 'expiring_soon' | 'expired' | 'none';

/**
 * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7. Sub-shape del campo
 * opcional `ServiceInfo.ssl?`. Read-only — Aelium no gestiona el cert
 * (DH-INV-6 — el proveedor es authoritative); este shape solo existe
 * para que la UI exponga el estado al cliente / admin.
 */
export interface ServiceSslSummary {
  status: ServiceSslStatus;
  /** ISO-8601. Solo presente si `status !== 'none'`. */
  expiresAt?: string;
  /** Si el proveedor renueva automáticamente; `undefined` si no determinable. */
  autoRenew?: boolean;
  /** Display-only. La UI NUNCA ramifica comportamiento por este valor. */
  issuer?: string;
}

/**
 * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 (2026-05-18).
 *
 * Representa una "aplicación instalada" dentro del recurso del proveedor
 * (típicamente una website/hosting): WordPress, Joomla, futuros CMS.
 * Espejo del shape del backend (`backend/src/core/provisioning/types.ts`).
 *
 * Shape mínimo contractual genérico. Los detalles per-kind (WordPressInfo,
 * JoomlaInfo, ...) son plugin-internal y viven en endpoints/actions
 * plugin-internos invocados on-demand cuando F.10.x stats UI lo requiera
 * (DC.NEW-51).
 *
 * Capability-driven por presencia (mismo molde A5/A6/A7/A8): plugins que
 * NO soporten apps instalables OMITEN `ServiceInfo.apps`. El frontend
 * renderiza `<AppShortcutsCard>` solo si `info.apps !== undefined &&
 * info.apps.length > 0` — NUNCA ramifica por `provisioner_slug` (ADR-070).
 */
export interface AppPresence {
  /**
   * ID estable provisto por el proveedor (UUID en Enhance; string libre
   * en general). Sirve como discriminator del payload en
   * `executeAction('open_app_admin', { appId })`.
   */
  appId: string;
  /**
   * String libre plugin-internal (mismo patrón `ServiceAction.slug`).
   * Valores actuales (Sprint 15C.II Fase F.10): `'wordpress'` | `'joomla'`.
   * Valores futuros (heredabilidad): `'nodejs'`, `'drupal'`, etc. — sin
   * amendment del contrato.
   */
  kind: string;
  /**
   * i18n key (translatable en el frontend).
   * Ejemplos: `'plugin.enhance_cp.apps.wordpress'`, `'plugin.enhance_cp.apps.joomla'`.
   */
  label: string;
  /**
   * Subdirectorio si la app NO está instalada en la raíz. Permite
   * multi-instancia (WP en `/` + WP en `/blog` → 2 entries diferenciadas).
   */
  path?: string;
  /** Versión instalada de la app (informativo, display-only). */
  version?: string;
  /**
   * Acciones disponibles per-instalación. Sprint 15C.II Fase F.10 declara
   * una sola acción canónica: `'open_app_admin'` (slug fijo + payload
   * `{ appId }` — discriminator interno del plugin por kind).
   *
   * Si `actions` está vacío (ej. WP sin default user configurado), el
   * frontend renderiza el atajo DISABLED con tooltip + CTA al panel.
   */
  actions: readonly ServiceAction[];
}

export interface ServiceInfo {
  status:
    | 'active'
    | 'suspended'
    | 'expired'
    | 'pending'
    | 'failed'
    | 'cancelled'
    | 'unknown';
  statusReason?: string;
  /**
   * Sprint 15C.II Fase E — ADR-077 Amendment A5. Solo relevante si `status`
   * es de drift. Si presente, indica la clase de remediación que la UI debe
   * ofrecer al admin. Ver `ServiceRecoveryHint`.
   */
  recoveryHint?: ServiceRecoveryHint;
  display: {
    primary: string;
    secondary?: string;
    expiresAt?: string;
    autoRenew?: boolean;
  };
  metrics?: ServiceMetrics;
  /**
   * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7. Solo presente si el
   * plugin puede leer el estado del cert SSL/TLS. Si ausente, la UI no
   * renderiza la card SSL. La presencia del campo es la señal de
   * capability — no se añade flag nuevo a `ServiceInfoCapabilities`.
   */
  ssl?: ServiceSslSummary;
  /**
   * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9. Apps CMS instaladas
   * dentro del recurso del proveedor (websites con WordPress / Joomla /
   * etc.). Capability-driven por presencia (mismo molde A5/A6/A7/A8).
   */
  apps?: readonly AppPresence[];
  capabilities: ServiceInfoCapabilities;
  availableActions: readonly ServiceAction[];
  fetchedAt: string;
}

export interface ServiceDetailResponse {
  service: {
    id: string;
    user_id: string;
    status: string;
    provisioner_slug: string | null;
    /**
     * Sprint 15C.II Fase C round 2 — `product.provisioner` expuesto al
     * frontend para que la UI admin pueda mostrar el "effective slug"
     * cuando `service.provisioner_slug` es null. El wrapper canónico
     * provisioning resuelve el plugin con
     * `service.provisioner_slug ?? service.product.provisioner` — si el
     * service no tiene su propio slug (típicamente porque el pipeline
     * provisioning no llegó a marcarlo, caso `not_yet_provisioned`),
     * el plugin del producto SÍ se invoca. Sin este campo la UI
     * admin mostraba "—" — información engañosa para el operador.
     * Cliente NO lo usa (su UI no muestra esta info técnica).
     */
    product_provisioner: string;
    product_slug: string;
    product_name: string;
    product_type: string;
    created_at: string;
    /**
     * Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10) —
     * cancelación explícita expuesta al frontend. Backend la persiste
     * en `service.cancellation_reason` (text libre — viene de
     * `provisioning_failed:CODE` para fail permanente, o text admin
     * para cancelación manual). El frontend admin la muestra cruda;
     * el frontend cliente solo la usa para chequear si renderizar el
     * banner terminal "Servicio cancelado" (sin mostrar el reason
     * técnico — viola UI_SPEC §1.2 P5 "voz Aelium").
     */
    cancellation_reason: string | null;
    cancelled_at: string | null;
    /**
     * Sprint 15C.II Fase F (ADR-077 Amendment A4) — suspensión canónica.
     * `suspension_reason` es la cadena combinada `"<reason>"` o
     * `"<reason>: <internal_note>"` (mismo patrón que `cancellation_reason`):
     * el frontend admin muestra la cadena completa; el frontend cliente solo
     * la parte `<reason>` (etiqueta localizada `service.suspension_reason.*`).
     * Ambos `null` cuando el service no está suspendido.
     */
    suspended_at: string | null;
    suspension_reason: string | null;
    /**
     * Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10) —
     * datos canónicos del cliente para que la UI admin muestre info
     * legible (nombre + email) en lugar de UUIDs crudos. Estándar
     * industria Stripe/Vercel admin: información primaria visible,
     * IDs secundarios con copy-to-clipboard. Cliente NO consume estos
     * campos en su propia página `/dashboard/services/[id]` (su nombre
     * y email son trivialmente conocidos por sí mismo).
     */
    client_name: string;
    client_email: string;
    /**
     * Domain canónico del service (FQDN). Puede ser null para
     * productos no-hosting (ej. `support_inside`). Cuando presente,
     * la UI admin lo muestra como identificador primario del service
     * (ADR-082 DH-INV-2 — hosting service SIEMPRE tiene FQDN).
     */
    domain: string | null;
    /**
     * Sprint 15C.II Fase F.4.1 — `true` cuando el estado de suspensión
     * registrado en Aelium (`services.status`, autoritativo para el
     * lifecycle administrativo) no coincide con el que reporta el
     * proveedor (dimensión operativa — DH-INV-6). Lo calcula el
     * orquestador (`getInfoForUser`). La UI admin lo usa para mostrar el
     * `<AdminProviderStateDesyncBanner>` con el botón "Realinear estado
     * del proveedor con Aelium" (`POST /admin/services/:id/resync-provider-state`).
     * El cliente no lo consume.
     */
    provider_state_desync: boolean;
    /**
     * Sprint 15C.II Fase F.8 — umbral de alerta de cuota de disco que el
     * frontend usa para colorear la barra de almacenamiento del `MetricsBar`
     * (ámbar ≥threshold, rojo ≥95% hardcoded). El orquestador lo lee de
     * `plugin_installs.config.quota_alert_threshold_pct` cuando el plugin
     * declara `has_metrics`. `null` cuando el plugin no es relevante o el
     * setting no está editado → el frontend cae al comportamiento legacy
     * (sin coloreo). Heredable a todo plugin con `has_metrics`.
     */
    quota_alert_threshold_pct: number | null;
  };
  info: ServiceInfo;
}

export interface SsoUrl {
  url: string;
  expiresAt: string;
  panelLabel: string;
  opensIn: 'new_tab';
}

export interface ActionResult {
  success: boolean;
  message?: string;
  sideEffects?: readonly string[];
  data?: Record<string, unknown>;
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase F.9 (ADR-077 Amendment A8 + §A.11.10.6.2 R1..R6 frozen)
   — shapes per-servicio del flujo reconcile-single. Espejo del backend
   `backend/src/core/provisioning/types.ts §9.5`. Duplicación canónica por
   R4 (frontend vive en otro paquete que el backend).
   ═══════════════════════════════════════ */

export type ServiceDriftType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

export interface ServiceDrift {
  readonly type: ServiceDriftType;
  readonly before: unknown;
  readonly after: unknown;
  readonly applied: boolean;
  readonly message?: string;
}

export interface ServiceReconcileResult {
  readonly driftsDetected: readonly ServiceDrift[];
  readonly driftsApplied: readonly ServiceDrift[];
  /**
   * Server devuelve ISO 8601 string; el action lo re-hidrata a Date para
   * el consumidor frontend (espejo del re-hidrato en backend
   * ProvisioningCacheService.getCachedServiceReconcileResult).
   */
  readonly reconciledAt: Date;
}

// ── DNS records (Sprint 15C Fase 15C.G — ADR-082 §6 + ADR-083 §5 decisiones 16-21) ──
//
// Tipos canónicos del flujo DNS records management. El frontend consume los
// 4 endpoints REST `/services/:id/dns/records` cableados en Sprint 15C Fase D.
// Backend canónico: `backend/src/plugins/provisioners/enhance_cp/api/types.ts`
// (`EnhanceDnsRecord`/`EnhanceDnsZone`). Frontend duplica el shape porque NO
// se puede importar desde backend (R4 — el frontend vive en otro paquete).

/**
 * Lista cerrada de record kinds expuestos al cliente v1 (ADR-083 §5
 * decisión 17). Plugins futuros con `has_dns_management=true` deben
 * soportar AL MENOS estos 7 — `SPF/NS/PTR/DS` están diferidos a v1.x.
 */
export type DnsRecordKindV1 =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'SRV'
  | 'CAA';

export const DNS_RECORD_KINDS_V1: ReadonlyArray<DnsRecordKindV1> = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'SRV',
  'CAA',
];

export interface DnsRecord {
  readonly id: string;
  readonly kind: DnsRecordKindV1;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly proxy: boolean;
}

export interface DnsSoa {
  readonly adminEmail: string;
  readonly nameServer: string;
  readonly expire: number;
  readonly refresh: number;
  readonly retry: number;
  readonly ttl: number;
}

/**
 * Estado DNSSEC read-only de la zona — Sprint 15C.II Fase E (ADR-083
 * Amendment A5.3). Presente SOLO si la zona tiene DNSSEC firmado en el
 * proveedor (PowerDNS vía Enhance). Aelium NO gestiona DNSSEC (activar /
 * rotar keys = panel del proveedor, DC.NEW-15C-DNSSEC) — la UI solo lo
 * refleja con un Badge informativo. Heredable a cualquier plugin DNS-authority.
 */
export interface DnsZoneDnssec {
  readonly dsRecords: string;
  readonly dnskeyRecords: string;
}

export interface DnsZone {
  readonly origin: string;
  readonly soa: DnsSoa;
  readonly records: readonly DnsRecord[];
  /** Sprint 15C.II Fase E — presente solo si la zona tiene DNSSEC activo. */
  readonly dnssec?: DnsZoneDnssec;
}

/** Shape canónico de `result.data` que devuelve `list_dns_records`. */
export interface DnsListResultData {
  readonly zone: DnsZone;
}

/**
 * Authority del DNS resuelto por `core/provisioning/dns-authority-resolver.ts`.
 * `aelium` → existe plugin DNS authority activo (Enhance hoy). `external` →
 * NS apuntan fuera o no hay plugin con `has_dns_management=true`.
 */
export type DnsAuthority = 'aelium' | 'external';

/** Payload del GET /services/:id/dns/records (status 200).
 *
 *  `result.data` es OPCIONAL: si el plugin lanza `ProvisionerPluginError`
 *  retriable o no-retriable (ej. `INVALID_STATE` cuando el service no tiene
 *  `enhance_website_id` en metadata), el wrapper canónico devuelve
 *  `{success: false, message}` SIN `data`. La SC parent debe ramificar por
 *  `result.success` antes de leer `data.zone`. */
export interface DnsListResponse {
  readonly authority: 'aelium';
  readonly plugin_slug: string;
  readonly nameservers: readonly string[];
  readonly result: {
    readonly success: boolean;
    readonly message?: string;
    readonly data?: DnsListResultData;
  };
}

/** Payload del POST/PATCH/DELETE (status 200/201). */
export interface DnsRecordActionResponse {
  readonly authority: 'aelium';
  readonly plugin_slug: string;
  readonly result: {
    readonly success: boolean;
    readonly data?: { recordId?: string };
  };
}

/**
 * Shape de error 404 cuando el resolver determina que el DNS NO es
 * autoridad Aelium (ADR-082 §6). Frontend ramifica por `code` para
 * pintar banner explicativo + nameservers actuales del dominio.
 */
export interface DnsExternallyManagedError {
  readonly code: 'DNS_MANAGED_EXTERNALLY' | 'DNS_NO_AUTHORITY_PLUGIN';
  readonly reason: string;
  readonly nameservers: readonly string[];
  readonly hint: string;
  readonly message: string;
}

/** Body del POST /services/:id/dns/records. Refleja `CreateDnsRecordDto` backend. */
export interface CreateDnsRecordPayload {
  readonly kind: DnsRecordKindV1;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly proxy?: boolean;
}

/** Body del PATCH /services/:id/dns/records/:recordId. Todos campos opcionales. */
export interface UpdateDnsRecordPayload {
  readonly kind?: DnsRecordKindV1;
  readonly name?: string;
  readonly value?: string;
  readonly ttl?: number;
  readonly proxy?: boolean;
}

export const servicesApi = {
  // ── Cliente ──
  list: (
    token: string,
    params?: { page?: number; limit?: number; status?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return api<ServiceListResponse>(`/services${qs ? `?${qs}` : ''}`, {
      token,
    });
  },

  detail: (token: string, id: string) =>
    api<ServiceDetailResponse>(`/services/${id}`, { token }),

  sso: (token: string, id: string) =>
    api<{ sso: SsoUrl | null }>(`/services/${id}/sso`, {
      method: 'POST',
      token,
    }),

  executeAction: (
    token: string,
    id: string,
    slug: string,
    payload: Record<string, unknown>,
  ) =>
    api<ActionResult>(`/services/${id}/actions/${slug}`, {
      method: 'POST',
      token,
      body: { payload },
    }),

  // ── Admin ──
  adminList: (
    token: string,
    params?: {
      page?: number;
      limit?: number;
      user_id?: string;
      provisioner_slug?: string;
      status?: string;
      search?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.user_id) query.set('user_id', params.user_id);
    if (params?.provisioner_slug)
      query.set('provisioner_slug', params.provisioner_slug);
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return api<ServiceListResponse>(`/admin/services${qs ? `?${qs}` : ''}`, {
      token,
    });
  },

  adminDetail: (token: string, id: string) =>
    api<ServiceDetailResponse>(`/admin/services/${id}`, { token }),

  adminReprovision: (token: string, id: string) =>
    api<{ enqueued: true }>(`/admin/services/${id}/reprovision`, {
      method: 'POST',
      token,
    }),

  adminDeprovision: (
    token: string,
    id: string,
    body: {
      reason: 'cancelled' | 'expired' | 'admin_override';
      notes?: string;
    },
  ) =>
    api<{ id: string; status: string; cancellation_reason: string }>(
      `/admin/services/${id}/deprovision`,
      { method: 'POST', token, body },
    ),
};

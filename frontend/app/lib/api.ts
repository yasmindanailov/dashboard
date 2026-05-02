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

  // Structured notes (7.H19)
  listStructuredNotes: (token: string, userId: string, params?: { category?: string; pinned_only?: boolean; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.pinned_only) query.set('pinned_only', 'true');
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api(`/admin/clients/${userId}/structured-notes${qs ? `?${qs}` : ''}`, { token });
  },

  createStructuredNote: (token: string, userId: string, data: { body: string; category?: string; conversation_id?: string; is_pinned?: boolean }) =>
    api(`/admin/clients/${userId}/structured-notes`, { method: 'POST', token, body: data }),

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

export const tasksApi = {
  list: (token: string, params?: {
    page?: number; limit?: number; status?: string; type?: string;
    priority?: string; assigned_to?: string; search?: string; time_range?: string;
    /**
     * Sprint 8.B.1.bis: vista segmentada según UI_SPEC §5.15.
     * `mine` = mis tareas · `unassigned` = sin asignar · `all` = todas.
     * Sin scope: comportamiento clásico (agente ve mine+unassigned, admin ve todas).
     */
    scope?: 'mine' | 'unassigned' | 'all';
    /** Sprint 8 Fase B.10 — ADR-074: filtra por ticket vinculado. */
    conversation_id?: string;
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
    if (params?.scope) query.set('scope', params.scope);
    if (params?.conversation_id) query.set('conversation_id', params.conversation_id);
    const qs = query.toString();
    return api(`/tasks${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/tasks/${id}`, { token }),

  create: (token: string, data: Record<string, unknown>) =>
    api('/tasks', { method: 'POST', token, body: data }),

  update: (token: string, id: string, data: Record<string, unknown>) =>
    api(`/tasks/${id}`, { method: 'PATCH', token, body: data }),

  /**
   * Cierra una tarea. Shape soportado:
   *   - Flujo simple (B.9): `{client_notes?, internal_notes?}` — si la
   *     tarea no tiene conversation_id, `client_notes` dispara email al
   *     cliente vía `task.completed` listener.
   *   - Flujo bridge (B.10, ADR-074): `{ticket_action, resolution_note}`
   *     — si la tarea tiene `conversation_id`, el backend marca el
   *     ticket vinculado como `resolved` o `closed` y persiste la nota
   *     interna. Sin notificación duplicada al cliente (la dispara
   *     el módulo support).
   */
  complete: (
    token: string,
    id: string,
    data: {
      client_notes?: string;
      internal_notes?: string;
      ticket_action?: 'resolve' | 'close';
      resolution_note?: string;
    },
  ) => api(`/tasks/${id}/complete`, { method: 'PATCH', token, body: data }),

  delete: (token: string, id: string) =>
    api(`/tasks/${id}`, { method: 'DELETE', token }),

  /**
   * Sprint 8.B.1.bis: acepta `scope` para alinear los contadores con la
   * vista segmentada activa. Sin `scope`, comportamiento legacy (admin
   * ve todo, agente ve mine+unassigned mezcladas — coherente con
   * `tasksApi.list` cuando tampoco se pasa scope).
   */
  getStats: (token: string, scope?: 'mine' | 'unassigned' | 'all') => {
    const qs = scope ? `?scope=${scope}` : '';
    return api(`/tasks/stats${qs}`, { token });
  },

  /**
   * Sprint 8 Fase B.5 (2026-04-29) — checklist + maintenance log.
   *
   * `getChecklist` devuelve `{ items, completions }` para la task. La UI
   * los cruza para renderizar checkboxes con su estado.
   */
  getChecklist: (token: string, taskId: string) =>
    api(`/tasks/${taskId}/checklist`, { token }),

  /** Marca un item como completado (idempotente por backend upsert). */
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

  /**
   * Cierra task de mantenimiento: valida items requeridos + crea
   * `maintenance_log` + emite `maintenance.completed` (notifica al
   * cliente). Si faltan items obligatorios → 400 con
   * `missing_required: [{id, label, kind}]` para que la UI los muestre.
   */
  recordMaintenanceLog: (
    token: string,
    taskId: string,
    data: {
      notes: string;
      month_year?: string;
      internal_notes?: string;
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

  /* ── Sprint 8 Fase B.9 (2026-04-30) — Notas internas inline ── */

  /**
   * Lista las notas internas (`category=technical`) asociadas a la tarea.
   * Devuelve cada nota con su autor (first/last_name) ya enriquecido para
   * evitar N+1 al renderizar la card en el detail.
   */
  listNotes: (token: string, taskId: string) =>
    api<TaskNotePayload[]>(`/tasks/${taskId}/notes`, { token }),

  /**
   * Persiste inmediatamente una nota interna (no se acumula en estado
   * local). Devuelve la nota recién creada para refrescar la lista.
   */
  createNote: (token: string, taskId: string, body: string) =>
    api<TaskNotePayload>(`/tasks/${taskId}/notes`, {
      method: 'POST',
      token,
      body: { body },
    }),
};

export interface TaskNotePayload {
  id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

// ── Task Tags API ── Sprint 8 Fase B.7 (ADR-073)

export interface TaskTagPayload {
  id: string;
  slug: string;
  label: string;
  color: string | null;
  created_at: string;
}

export const taskTagsApi = {
  list: (token: string) =>
    api<TaskTagPayload[]>('/admin/task-tags', { token }),

  create: (
    token: string,
    data: { label: string; slug?: string; color?: string },
  ) => api<TaskTagPayload>('/admin/task-tags', { method: 'POST', token, body: data }),

  delete: (token: string, id: string) =>
    api(`/admin/task-tags/${id}`, { method: 'DELETE', token }),
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
  hasSsoPanel: boolean;
  inlineActions: ServiceAction[];
}

export interface ServiceAction {
  slug: string;
  label: string;
  description?: string;
  confirmRequired: boolean;
  confirmationText?: string;
  destructive: boolean;
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
  display: {
    primary: string;
    secondary?: string;
    expiresAt?: string;
    autoRenew?: boolean;
  };
  metrics?: ServiceMetrics;
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
    product_slug: string;
    product_name: string;
    product_type: string;
    created_at: string;
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

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


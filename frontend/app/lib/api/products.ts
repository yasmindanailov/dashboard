import { api } from './client';

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


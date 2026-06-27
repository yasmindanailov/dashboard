import { api } from './client';

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


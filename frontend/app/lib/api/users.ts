import { api } from './client';

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


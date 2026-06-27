import { api } from './client';

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


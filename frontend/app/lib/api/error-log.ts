import { api } from './client';

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


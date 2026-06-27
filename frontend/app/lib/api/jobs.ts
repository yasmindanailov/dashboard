import { api } from './client';

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


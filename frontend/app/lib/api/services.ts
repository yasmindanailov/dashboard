import { api } from './client';
import type {
  ServiceListResponse,
  ServiceDetailResponse,
  SsoUrl,
  ActionResult,
} from './service-types';

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

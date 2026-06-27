import { api } from './client';
import type { NotificationChannel } from './notifications';

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


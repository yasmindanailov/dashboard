import { api } from './client';

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


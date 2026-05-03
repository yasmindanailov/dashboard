'use server';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { NotificationItem, UnreadNotificationsResponse } from '../../lib/api';

/* ═══════════════════════════════════════
   Server Actions — _shared/shell (NotificationBell).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   ═══════════════════════════════════════ */

export type UnreadNotificationsResult =
  | { ok: true; items: NotificationItem[]; unreadCount: number }
  | { ok: false; error: string; status?: number };

export async function fetchUnreadNotificationsAction(): Promise<UnreadNotificationsResult> {
  try {
    const res = await serverFetch<UnreadNotificationsResponse>(
      '/notifications/unread',
    );
    return { ok: true, items: res.data, unreadCount: res.unread_count };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      return { ok: false, error: err.message, status: err.status };
    }
    return { ok: false, error: 'No se pudieron cargar las notificaciones' };
  }
}

export type NotificationMutationResult = { ok: true } | { ok: false; error: string };

export async function markNotificationReadAction(
  id: string,
): Promise<NotificationMutationResult> {
  try {
    await serverFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo marcar como leída',
    };
  }
}

export async function markAllNotificationsReadAction(): Promise<NotificationMutationResult> {
  try {
    await serverFetch('/notifications/read-all', { method: 'PATCH' });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron marcar como leídas',
    };
  }
}

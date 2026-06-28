/**
 * /admin/notifications — Bandeja de notificaciones de staff/superadmin (F3·E10).
 * Server Component (Modelo A). Convive con /admin/notifications/templates (editor
 * de plantillas). Mismos endpoints `/notifications/*` que el cliente: el backend
 * resuelve ownership por user_id (a superadmin se le despachan sus alertas).
 */

import type { NotificationItem } from '../../lib/api';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import NotificationsView from '../../_shared/notifications/NotificationsView';
import { ADMIN_CATEGORY_CHIPS } from '../../_shared/notifications/notification-presentation';

interface ListResponse {
  data: NotificationItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
interface UnreadResponse {
  unread_count: number;
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function AdminNotificationsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);
  const category = singleParam(params.category);
  const unreadOnly = singleParam(params.unread_only) === 'true';

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '20');
  if (category) query.set('category', category);
  if (unreadOnly) query.set('unread_only', 'true');

  let items: NotificationItem[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 1 };
  let unreadCount = 0;
  try {
    const [list, unread] = await Promise.all([
      serverFetch<ListResponse>(`/notifications?${query.toString()}`),
      serverFetch<UnreadResponse>('/notifications/unread'),
    ]);
    items = list.data;
    meta = list.meta;
    unreadCount = unread.unread_count;
  } catch (err) {
    if (!(err instanceof ServerFetchError)) throw err;
    /* Errores de red/HTTP → lista vacía + contador 0 (R14). */
  }

  return (
    <NotificationsView
      items={items}
      meta={meta}
      unreadCount={unreadCount}
      activeCategory={category}
      unreadOnly={unreadOnly}
      config={{
        basePath: '/admin/notifications',
        subtitle:
          'Lo que ocurre en la plataforma y requiere tu atención. Lo mismo que te llega por email y en la campana.',
        categoryChips: ADMIN_CATEGORY_CHIPS,
        emptyTitle: 'Todo en orden',
        emptyBody:
          'No hay nada que requiera tu atención ahora mismo. Te avisaremos aquí de cualquier evento de la plataforma.',
        retentionNote: 'Conservamos las notificaciones durante 90 días.',
      }}
    />
  );
}

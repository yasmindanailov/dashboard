'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, Check } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ListPage,
  NotificationRow,
  Pagination,
  SegmentedControl,
  useToast,
} from '../../components/ui';
import type { NotificationItem } from '../../lib/api';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '../shell/_actions';
import {
  eventOf,
  presentNotification,
  type CategoryChip,
} from './notification-presentation';
import { groupNotificationsByDate, relativeTime } from './notification-groups';
import s from './NotificationsView.module.css';

/* ═══════════════════════════════════════
   NotificationsView — bandeja full-page (F3·E10). Compartida por cliente
   (/dashboard/notifications) y admin (/admin/notifications); el `config`
   parametriza copy, chips de categoría y ruta base. 1:1 con el mockup.

   Patrón RSC: los datos llegan prehidratados del Server Component; los filtros
   (estado/categoría/página) viajan por searchParams → el SC re-fetcha con el
   filtro server-side. Sin estado de items en cliente (evita drift). Marcar
   leída es implícito al abrir (decisión Yasmin). R14: errores vía toast.
   ═══════════════════════════════════════ */

export interface NotificationsViewConfig {
  basePath: string;
  subtitle: string;
  categoryChips: CategoryChip[];
  emptyTitle: string;
  emptyBody: string;
  retentionNote: string;
}

interface Props {
  items: NotificationItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  unreadCount: number;
  activeCategory: string;
  unreadOnly: boolean;
  config: NotificationsViewConfig;
}

const SEGMENTS = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'No leídas' },
];

export default function NotificationsView({
  items,
  meta,
  unreadCount,
  activeCategory,
  unreadOnly,
  config,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function pushParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    startTransition(() => router.push(`${config.basePath}?${params.toString()}`));
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`${config.basePath}?${params.toString()}`));
  }

  async function handleOpen(item: NotificationItem) {
    if (!item.read_at) {
      const result = await markNotificationReadAction(item.id);
      if (!result.ok) toast('error', result.error);
    }
    if (item.action_url) router.push(item.action_url);
    else startTransition(() => router.refresh());
  }

  async function handleMarkAll() {
    const result = await markAllNotificationsReadAction();
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  const groups = groupNotificationsByDate(items);
  const filtersActive = unreadOnly || activeCategory !== '';

  return (
    <ListPage
      title="Notificaciones"
      subtitle={config.subtitle}
      action={
        <div className={s.headerActions}>
          {unreadCount > 0 && (
            <Badge variant="brand">{unreadCount} sin leer</Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Check size={15} strokeWidth={2.2} aria-hidden="true" />}
            disabled={unreadCount === 0}
            onClick={() => void handleMarkAll()}
          >
            Marcar todas como leídas
          </Button>
        </div>
      }
      filterBar={
        <div className={s.filters}>
          <SegmentedControl
            options={SEGMENTS}
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(v) =>
              pushParam('unread_only', v === 'unread' ? 'true' : '')
            }
            aria-label="Filtrar por estado de lectura"
          />
          <ChipGroup
            options={config.categoryChips}
            value={activeCategory}
            onChange={(v) => pushParam('category', v)}
            aria-label="Filtrar por categoría"
          />
        </div>
      }
      pagination={
        meta.totalPages > 1 ? (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={handlePageChange}
          />
        ) : undefined
      }
    >
      {groups.length === 0 ? (
        <EmptyState
          icon={<Bell size={30} strokeWidth={1.7} aria-hidden="true" />}
          title={filtersActive ? 'Nada por aquí' : config.emptyTitle}
          description={
            filtersActive
              ? 'No hay notificaciones que coincidan con este filtro.'
              : config.emptyBody
          }
          action={
            filtersActive ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(config.basePath)}
              >
                Ver todas las notificaciones
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={s.groups}>
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className={s.groupLabel}>{group.label}</h2>
              <Card padding="none">
                {group.items.map((item) => {
                  const visual = presentNotification(
                    item.category,
                    eventOf(item.metadata),
                  );
                  return (
                    <NotificationRow
                      key={item.id}
                      icon={visual.icon}
                      tone={visual.tone}
                      title={item.title}
                      category={visual.categoryLabel}
                      body={item.body}
                      time={relativeTime(item.created_at)}
                      unread={!item.read_at}
                      actionLabel={item.action_url ? 'Ver detalle' : undefined}
                      onClick={() => void handleOpen(item)}
                    />
                  );
                })}
              </Card>
            </section>
          ))}
          <p className={s.retention}>{config.retentionNote}</p>
        </div>
      )}
    </ListPage>
  );
}

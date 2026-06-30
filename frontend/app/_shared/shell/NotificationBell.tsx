'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import type { NotificationItem } from '../../lib/api';
import { IconWell } from '../../components/ui';
import {
  eventOf,
  presentNotification,
} from '../notifications/notification-presentation';
import { relativeTime } from '../notifications/notification-groups';
import {
  fetchUnreadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from './_actions';
import styles from './NotificationBell.module.css';

/* ═══════════════════════════════════════
   NotificationBell — Sprint 9.5 (ADR-042 + ADR-065).

   Campana del Topbar (cualquier rol autenticado). Polling cada 30s al
   endpoint cliente `GET /notifications/unread`. Click en una entrada:
   marca como leída y, si tiene `action_url`, navega; si no, solo marca.
   "Marcar todas" purga el contador en una sola llamada.

   El render del HTML del body se evita en la campana (canal `internal`
   se renderiza como texto plano vía Handlebars `noEscape:false`).
   ═══════════════════════════════════════ */

const POLL_INTERVAL_MS = 30_000;

interface NotificationBellProps {
  triggerClassName?: string;
}

export default function NotificationBell({ triggerClassName }: NotificationBellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUnread = useCallback(async () => {
    const result = await fetchUnreadNotificationsAction();
    if (!result.ok) {
      /* 401 transitorio (sesión expirada) — no asustamos al usuario. */
      if (result.status !== 401) {
        console.warn('[NotificationBell] fetch unread failed:', result.error);
      }
      return;
    }
    setItems(result.items);
    setUnreadCount(result.unreadCount);
    setError(null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling timer canónico: subscribe a un sistema externo (backend) con setInterval; setState en callback es el patrón React 19 idiomático.
    void fetchUnread();
    const interval = setInterval(() => void fetchUnread(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Cierre al click fuera del dropdown.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleItemClick(item: NotificationItem): Promise<void> {
    setLoading(true);
    if (!item.read_at) {
      const result = await markNotificationReadAction(item.id);
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setUnreadCount((c) => Math.max(0, c - 1));
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
    }
    setLoading(false);
    if (item.action_url) {
      setOpen(false);
      router.push(item.action_url);
    }
  }

  async function handleMarkAll(): Promise<void> {
    setLoading(true);
    const result = await markAllNotificationsReadAction();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUnreadCount(0);
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    );
  }

  /** Destino de "Ver todas" según el portal. La página full-page es E10 (F3). */
  function goAllNotifications(): void {
    setOpen(false);
    // Bandeja full-page (F3·E10): admin vs cliente según el portal activo.
    router.push(pathname?.startsWith('/admin') ? '/admin/notifications' : '/dashboard/notifications');
  }

  function toggleOpen(): void {
    /*
     * El updater function de setState debe ser puro — disparar el Server Action
     * desde dentro provoca "Cannot update Router while rendering" porque la
     * action invalida la cache de Next.js durante el render. Separamos: leemos
     * el estado previo en este render (open) y disparamos el fetch FUERA del
     * updater. R14 + ADR-078 Amendment A1.
     */
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) void fetchUnread();
  }

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <button
        type="button"
        className={triggerClassName ?? styles.trigger}
        onClick={toggleOpen}
        aria-label="Notificaciones"
        aria-expanded={open}
        data-testid="notification-bell"
      >
        <Bell size={20} strokeWidth={1.6} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className={styles.badge} data-testid="notification-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.panel} role="menu">
          <header className={styles.header}>
            <span className={styles.title}>Notificaciones</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => void handleMarkAll()}
              disabled={loading || unreadCount === 0}
            >
              Marcar leídas
            </button>
          </header>

          {error && <div className={styles.error}>{error}</div>}

          {items.length === 0 ? (
            <div className={styles.empty}>No tienes notificaciones nuevas.</div>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => {
                const ts = relativeTime(item.created_at);
                const unread = !item.read_at;
                const visual = presentNotification(
                  item.category,
                  eventOf(item.metadata),
                );
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`${styles.item} ${unread ? styles.itemUnread : ''}`}
                      onClick={() => void handleItemClick(item)}
                      data-testid={`notification-item-${item.id}`}
                    >
                      <IconWell icon={visual.icon} tone={visual.tone} size="sm" />
                      <span className={styles.itemContent}>
                        <span className={`${styles.itemTitle} ${unread ? styles.itemTitleUnread : ''}`}>
                          {item.title}
                        </span>
                        <span className={styles.itemTime}>{ts}</span>
                      </span>
                      {unread && <span className={styles.dot} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className={styles.footer}>
            <button type="button" className={styles.linkBtn} onClick={goAllNotifications}>
              Ver todas
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

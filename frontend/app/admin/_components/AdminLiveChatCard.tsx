'use client';

import { MessageCircle } from 'lucide-react';

import styles from './AdminLiveChatCard.module.css';

export interface LiveChat {
  id: string;
  name: string;
  initials: string;
  /** Texto de espera, ej: "hace 4 min" / "ahora". */
  wait: string;
  /** En espera de agente (colorea el tiempo en ámbar). */
  waiting?: boolean;
  /** Último mensaje (preview). */
  msg: string;
  onClick?: () => void;
}

export interface AdminLiveChatCardProps {
  waitingCount: number;
  chats: LiveChat[];
  onOpenChats: () => void;
}

/**
 * AdminLiveChatCard — tarjeta "Chat en vivo" del footer del sidebar admin
 * (mockup admin/Shell.dc.html líneas 94-122): cabecera (punto verde con ping +
 * "Chat en vivo" + "{N} en espera") + lista de chats en espera + "Abrir panel
 * de chats". Presentacional.
 *
 * TODO(F3): la cola en vivo enriquecida (nombre/iniciales/espera por chat) no
 * tiene endpoint dedicado hoy; en F2 llega por props (vacía) y se cablea en F3.
 */
export function AdminLiveChatCard({ waitingCount, chats, onOpenChats }: AdminLiveChatCardProps) {
  return (
    <div className={styles.card}>
      <button type="button" className={styles.header} onClick={onOpenChats}>
        <span className={styles.headerLeft}>
          <span className={styles.ping} aria-hidden="true">
            <span className={styles.pingRing} />
            <span className={styles.pingDot} />
          </span>
          <span className={styles.headerTitle}>Chat en vivo</span>
        </span>
        {waitingCount > 0 && <span className={styles.waitBadge}>{waitingCount} en espera</span>}
      </button>

      <div className={styles.list}>
        {chats.map((c) => (
          <button key={c.id} type="button" className={styles.row} onClick={c.onClick}>
            <span className={styles.avatar}>{c.initials}</span>
            <span className={styles.body}>
              <span className={styles.titleRow}>
                <span className={styles.name}>{c.name}</span>
                <span className={`${styles.wait} ${c.waiting ? styles.waitActive : ''}`}>{c.wait}</span>
              </span>
              <span className={styles.msg}>{c.msg}</span>
            </span>
          </button>
        ))}
      </div>

      <button type="button" className={styles.openBtn} onClick={onOpenChats}>
        Abrir panel de chats
      </button>
    </div>
  );
}

export interface AdminLiveChatMiniProps {
  waitingCount: number;
  onOpenChats: () => void;
}

/**
 * AdminLiveChatMini — FAB del chat en vivo cuando el sidebar está contraído
 * (mockup admin/Shell.dc.html líneas 124-132).
 */
export function AdminLiveChatMini({ waitingCount, onOpenChats }: AdminLiveChatMiniProps) {
  const label = `Chat en vivo — ${waitingCount} en espera`;
  return (
    <div className={styles.miniWrap}>
      <button type="button" className={styles.fab} onClick={onOpenChats} title={label} aria-label={label}>
        <MessageCircle size={20} strokeWidth={1.6} aria-hidden="true" />
        {waitingCount > 0 && <span className={styles.fabBadge}>{waitingCount}</span>}
        <span className={styles.fabPresence} aria-hidden="true" />
      </button>
    </div>
  );
}

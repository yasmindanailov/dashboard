'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

import { IconWell, type IconWellTone } from '../IconWell';
import styles from './NotificationRow.module.css';

export interface NotificationRowProps {
  icon: LucideIcon;
  tone?: IconWellTone;
  title: string;
  /** Etiqueta de categoría (pill). */
  category?: string;
  body: string;
  /** Texto de tiempo relativo (ej: "hace 2 h"). */
  time: string;
  unread?: boolean;
  /** Texto del CTA contextual (con chevron). */
  actionLabel?: string;
  onClick?: () => void;
}

/**
 * NotificationRow — primitiva del DS (F1a). Fila rica de notificación del
 * mockup (`Notificaciones`): IconWell tintado + título + tag + cuerpo + CTA +
 * tiempo + punto de no-leído. Para las páginas de notificaciones (U13/U31).
 */
export function NotificationRow({
  icon,
  tone = 'brand',
  title,
  category,
  body,
  time,
  unread = false,
  actionLabel,
  onClick,
}: NotificationRowProps) {
  return (
    <button type="button" onClick={onClick} className={`${styles.row} ${unread ? styles.unread : ''}`}>
      <IconWell icon={icon} tone={tone} />
      <span className={styles.content}>
        <span className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          {category && <span className={styles.tag}>{category}</span>}
        </span>
        <span className={styles.body}>{body}</span>
        {actionLabel && (
          <span className={styles.action}>
            {actionLabel}
            <ChevronRight size={13} strokeWidth={2.2} aria-hidden="true" />
          </span>
        )}
      </span>
      <span className={styles.meta}>
        <span className={styles.time}>{time}</span>
        {unread && <span className={styles.dot} aria-hidden="true" />}
      </span>
    </button>
  );
}

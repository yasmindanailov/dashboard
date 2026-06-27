import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './ActivityRow.module.css';

export type ActivityTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export interface ActivityRowProps {
  /** Iniciales del actor → avatar redondo brand. Alternativa a `icon`. */
  initials?: string;
  /** Icono → círculo redondo tintado por tono. Alternativa a `initials`. */
  icon?: LucideIcon;
  tone?: ActivityTone;
  /** Texto principal (admite <strong> para el actor/sujeto). */
  children: ReactNode;
  /** Meta (tiempo relativo o fecha). */
  meta: string;
  className?: string;
}

/**
 * ActivityRow — primitiva del DS (F1a). Fila de la línea de actividad del
 * mockup (ServicioDetalle "Actividad", admin "Actividad reciente"): círculo
 * de 34px (avatar de iniciales o icono tintado) + texto + meta. Las filas se
 * apilan con separador superior para formar la timeline. Presentacional.
 */
export function ActivityRow({
  initials,
  icon: Icon,
  tone = 'brand',
  children,
  meta,
  className = '',
}: ActivityRowProps) {
  return (
    <div className={`${styles.row} ${className}`}>
      {initials ? (
        <span className={`${styles.circle} ${styles.avatar}`} aria-hidden="true">
          {initials}
        </span>
      ) : Icon ? (
        <span className={`${styles.circle} ${styles[tone]}`} aria-hidden="true">
          <Icon size={17} strokeWidth={1.8} />
        </span>
      ) : null}
      <span className={styles.content}>
        <span className={styles.text}>{children}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
    </div>
  );
}

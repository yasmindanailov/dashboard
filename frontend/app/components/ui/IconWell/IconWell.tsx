import type { LucideIcon } from 'lucide-react';

import styles from './IconWell.module.css';

export type IconWellTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
export type IconWellSize = 'sm' | 'md' | 'lg';

export interface IconWellProps {
  /** Icono Lucide a renderizar (stroke 1.6, hereda el color del tono). */
  icon: LucideIcon;
  tone?: IconWellTone;
  size?: IconWellSize;
  className?: string;
}

const ICON_PX: Record<IconWellSize, number> = { sm: 16, md: 18, lg: 22 };

/**
 * IconWell — primitiva del DS (F1a). Cuadrado tintado con un icono semántico,
 * coloreado por tono (mapea a los tokens del DS). El mockup lo usa en cabeceras
 * de card, filas de notificación, decision rows y timelines (≥12 unidades).
 * Presentacional (server-component compatible).
 */
export function IconWell({ icon: Icon, tone = 'brand', size = 'md', className = '' }: IconWellProps) {
  return (
    <span className={`${styles.well} ${styles[tone]} ${styles[size]} ${className}`} aria-hidden="true">
      <Icon size={ICON_PX[size]} strokeWidth={1.6} />
    </span>
  );
}

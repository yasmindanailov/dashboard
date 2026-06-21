import type { ReactNode } from 'react';
import styles from './AlertBanner.module.css';

/**
 * AlertBanner — Aelium Design System
 *
 * Inline banner for contextual messages:
 * info, success, warning, danger.
 *
 * @example
 *   <AlertBanner variant="info" title="Nota">
 *     El servicio se activará cuando la factura esté pagada.
 *   </AlertBanner>
 *
 * Ref: docs/40-reference/DESIGN_SYSTEM.md
 */

export type AlertBannerVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertBannerProps {
  /** Visual variant */
  variant?: AlertBannerVariant;
  /** Optional title (rendered bold) */
  title?: string;
  /** Content */
  children: ReactNode;
  /** Dismiss callback — shows close button */
  onClose?: () => void;
  /** Custom class */
  className?: string;
}

const VARIANT_ICONS: Record<AlertBannerVariant, ReactNode> = {
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  danger: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
};

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function AlertBanner({
  variant = 'info', title, children, onClose, className = '',
}: AlertBannerProps) {
  return (
    <div className={`${styles.banner} ${styles[variant]} ${className}`} role="alert">
      <span className={styles.icon}>{VARIANT_ICONS[variant]}</span>
      <div className={styles.content}>
        {title && <div className={styles.title}>{title}</div>}
        {children}
      </div>
      {onClose && (
        <button className={styles.close} onClick={onClose} aria-label="Cerrar" style={{ color: 'currentColor' }}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

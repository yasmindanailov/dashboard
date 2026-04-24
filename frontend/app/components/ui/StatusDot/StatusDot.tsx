import styles from './StatusDot.module.css';

export type StatusDotColor = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusDotProps {
  color?: StatusDotColor;
  pulse?: boolean;
  className?: string;
}

/** Dot indicator (8px) — replaces emoji status indicators */
export function StatusDot({ color = 'neutral', pulse = false, className = '' }: StatusDotProps) {
  return (
    <span
      className={`${styles.dot} ${styles[color]} ${pulse ? styles.pulse : ''} ${className}`}
      aria-hidden="true"
    />
  );
}

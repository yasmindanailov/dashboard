import type { ReactNode, CSSProperties } from 'react';
import styles from './StatsCard.module.css';

/**
 * StatsCard — Aelium Design System
 *
 * Metric display card for dashboard summaries.
 * Shows a label, numeric value, optional icon,
 * trend indicator, and subtext.
 *
 * @example
 *   <StatsCard
 *     label="Ingresos"
 *     value="12.450 €"
 *     icon={<EuroIcon />}
 *     trend={{ value: 12, direction: 'up' }}
 *     subtext="vs. mes anterior"
 *   />
 *
 * Ref: docs/40-reference/DESIGN_SYSTEM.md
 */

export interface StatsCardTrend {
  /** Percentage or absolute value */
  value: number | string;
  /** Direction */
  direction: 'up' | 'down';
}

export interface StatsCardProps {
  /** Metric label (string or ReactNode to embed HelpTip §4.12) */
  label: ReactNode;
  /** Metric value (pre-formatted) */
  value: string | number;
  /** Optional icon (ReactNode) */
  icon?: ReactNode;
  /** Trend indicator */
  trend?: StatsCardTrend;
  /** Additional context text */
  subtext?: string;
  /** Accent color for left border */
  accentColor?: string;
  /** Custom class */
  className?: string;
}

const TrendUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const TrendDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

export function StatsCard({
  label, value, icon, trend, subtext, accentColor, className = '',
}: StatsCardProps) {
  const cardClass = `${styles.card} ${accentColor ? styles.accent : ''} ${className}`;
  const cardStyle: CSSProperties = accentColor ? { '--accent-color': accentColor } as CSSProperties : {};

  return (
    <div className={cardClass} style={cardStyle}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {icon && <div className={styles.icon}>{icon}</div>}
      </div>
      <div className={styles.value}>{value}</div>
      {trend && (
        <span className={`${styles.trend} ${trend.direction === 'up' ? styles.trendUp : styles.trendDown}`}>
          {trend.direction === 'up' ? <TrendUp /> : <TrendDown />}
          {trend.value}%
        </span>
      )}
      {subtext && <p className={styles.subtext}>{subtext}</p>}
    </div>
  );
}

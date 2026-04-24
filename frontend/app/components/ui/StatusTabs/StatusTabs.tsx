/**
 * StatusTabs — Aelium Design System
 *
 * Tab bar with counters for filtering entities by status.
 * Used in list pages (UI_SPEC §2.4, §3.2).
 * Replaces StatsCards in list pages — counters filter AND inform.
 *
 * @example
 *   <StatusTabs
 *     tabs={[
 *       { label: 'Todas', value: '', count: 142 },
 *       { label: 'Pendientes', value: 'pending', count: 5 },
 *       { label: 'Pagadas', value: 'paid', count: 130 },
 *       { label: 'Vencidas', value: 'overdue', count: 7, variant: 'danger' },
 *     ]}
 *     active=""
 *     onChange={setStatusFilter}
 *   />
 *
 * Ref: docs/DESIGN_SYSTEM.md, docs/UI_SPEC.md §3.2, §3.7
 */

'use client';

import styles from './StatusTabs.module.css';

export type StatusTabVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusTab {
  /** Display label */
  label: string;
  /** Filter value (empty string = "all") */
  value: string;
  /** Count of entities in this status */
  count?: number;
  /** Visual variant for the count badge when active */
  variant?: StatusTabVariant;
}

export interface StatusTabsProps {
  /** Array of status tabs to render */
  tabs: StatusTab[];
  /** Currently active tab value */
  active: string;
  /** Callback when tab changes */
  onChange: (value: string) => void;
  /** Optional class name */
  className?: string;
}

export function StatusTabs({ tabs, active, onChange, className = '' }: StatusTabsProps) {
  return (
    <div className={`${styles.container} ${className}`} role="tablist" aria-label="Filter by status">
      {tabs.map((tab) => {
        const isActive = active === tab.value;
        const variant = tab.variant || 'default';

        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => onChange(tab.value)}
          >
            <span className={styles.label}>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`${styles.count} ${isActive ? styles[`count_${variant}`] : ''}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

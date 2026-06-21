import type { ReactNode } from 'react';
import styles from './FilterBar.module.css';

/**
 * FilterBar — Aelium Design System
 *
 * Standard filter row for list pages.
 * Search always left (flex-1), filter selects right.
 * No Card wrapper — goes directly on the page.
 *
 * @example
 *   <FilterBar
 *     search={
 *       <SearchInput
 *         value={search}
 *         onChange={(e) => setSearch(e.target.value)}
 *         onClear={() => setSearch('')}
 *         placeholder="Buscar clientes..."
 *       />
 *     }
 *     filters={
 *       <>
 *         <Select value={status} onChange={...} options={...} />
 *         <Select value={type} onChange={...} options={...} />
 *       </>
 *     }
 *   />
 *
 * Ref: docs/40-reference/UI_SPEC.md §3.4, docs/40-reference/DESIGN_SYSTEM.md Regla D10
 */

export interface FilterBarProps {
  /** Search input slot (flex-1, always left) */
  search: ReactNode;
  /** Filter selects slot (right side, max 2 selects) */
  filters?: ReactNode;
  /** Optional class name */
  className?: string;
}

export function FilterBar({ search, filters, className = '' }: FilterBarProps) {
  return (
    <div className={`${styles.bar} ${className}`}>
      <div className={styles.search}>{search}</div>
      {filters && <div className={styles.filters}>{filters}</div>}
    </div>
  );
}

export { FilterBar as default };

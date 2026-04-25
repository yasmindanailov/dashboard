'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import styles from './Table.module.css';

/* ═══════════════════════════════════════
   Table — Aelium Design System
   Supports sorting, loading skeleton,
   empty state, row clicks, and bulk
   selection with checkbox column (§4.11).

   Usage:
     <Table
       columns={cols}
       data={items}
       rowKey={(i) => i.id}
       selectable
       selectedIds={selected}
       onSelectionChange={setSelected}
     />

   Ref: DESIGN_SYSTEM.md, UI_SPEC §4.11
   ═══════════════════════════════════════ */

/* ── Types ── */

export interface TableColumn<T> {
  /** Unique key matching a property of T, or a custom string for computed columns */
  key: string;
  /** Column header label (string or ReactNode to embed HelpTip §4.12) */
  header: ReactNode;
  /** Render cell content. Receives the row item */
  render?: (item: T) => ReactNode;
  /** Enable sorting on this column */
  sortable?: boolean;
  /** Column width (CSS value) */
  width?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (item: T) => string | number;
  /** Controlled sort state */
  sort?: TableSort;
  /** Sort change handler */
  onSortChange?: (sort: TableSort) => void;
  /** Row click handler */
  onRowClick?: (item: T) => void;
  /** Loading state — shows skeleton rows */
  loading?: boolean;
  /** Number of skeleton rows to show */
  skeletonRows?: number;
  /** Empty state configuration */
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;

  /* ── Bulk selection (§4.11) ── */
  /** Enable checkbox column for row selection */
  selectable?: boolean;
  /** Controlled set of selected row keys */
  selectedIds?: Set<string | number>;
  /** Callback when selection changes */
  onSelectionChange?: (ids: Set<string | number>) => void;
}

/* ── Component ── */

export function Table<T>({
  columns,
  data,
  rowKey,
  sort,
  onSortChange,
  onRowClick,
  loading = false,
  skeletonRows = 5,
  emptyIcon,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  emptyAction,
  className = '',
  selectable = false,
  selectedIds,
  onSelectionChange,
}: TableProps<T>) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const direction: SortDirection =
      sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ key, direction });
  };

  /* ── Selection helpers ── */
  const allKeys = data.map((item) => rowKey(item));
  const selectedCount = selectedIds?.size ?? 0;
  const allSelected = allKeys.length > 0 && selectedCount === allKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  // Sync header checkbox indeterminate state (can't set via JSX)
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKeys));
    }
  };

  const handleSelectRow = (key: string | number, e: React.MouseEvent) => {
    // Prevent row click when clicking checkbox
    e.stopPropagation();
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            {/* Checkbox header */}
            {selectable && (
              <th className={`${styles.th} ${styles.checkboxCell}`}>
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className={styles.checkbox}
                  checked={allSelected}
                  onChange={handleSelectAll}
                  aria-label="Seleccionar todo"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${styles.th} ${col.sortable ? styles.sortable : ''} ${styles[`align_${col.align || 'left'}`]}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className={styles.thContent}>
                  {col.header}
                  {col.sortable && sort?.key === col.key && (
                    <span className={styles.sortIcon}>
                      {sort.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Loading state */}
          {loading &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`skeleton-${i}`} className={styles.tr}>
                {selectable && (
                  <td className={`${styles.td} ${styles.checkboxCell}`}>
                    <Skeleton width={16} height={16} />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={styles.td}>
                    <Skeleton
                      width={col.key === 'actions' ? 60 : '80%'}
                      height={14}
                    />
                  </td>
                ))}
              </tr>
            ))}

          {/* Data rows */}
          {!loading &&
            data.map((item) => {
              const key = rowKey(item);
              const isSelected = selectedIds?.has(key) ?? false;
              return (
                <tr
                  key={key}
                  className={`${styles.tr} ${onRowClick ? styles.clickable : ''} ${isSelected ? styles.trSelected : ''}`}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                >
                  {selectable && (
                    <td className={`${styles.td} ${styles.checkboxCell}`}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={(e) => handleSelectRow(key, e)}
                        aria-label={`Seleccionar fila ${key}`}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${styles.td} ${styles[`align_${col.align || 'left'}`]}`}
                    >
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>

      {/* Empty state */}
      {!loading && data.length === 0 && (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      )}
    </div>
  );
}

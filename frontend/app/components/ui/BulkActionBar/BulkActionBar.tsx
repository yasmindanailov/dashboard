'use client';

import type { ReactNode } from 'react';
import styles from './BulkActionBar.module.css';

/* ═══════════════════════════════════════
   BulkActionBar — Aelium Design System

   Floating bar that appears when ≥1 row is
   selected. Shows count + action buttons.

   Usage:
     {selected.size > 0 && (
       <BulkActionBar
         count={selected.size}
         onClear={() => setSelected(new Set())}
       >
         <Button size="sm" onClick={handleBulk}>Acción</Button>
       </BulkActionBar>
     )}

   Ref: UI_SPEC §4.11
   ═══════════════════════════════════════ */

export interface BulkActionBarProps {
  /** Number of selected items */
  count: number;
  /** Clear selection handler */
  onClear: () => void;
  /** Action buttons (children) */
  children: ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className={styles.bar} role="toolbar" aria-label={`${count} seleccionados`}>
      <span className={styles.count}>
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <span className={styles.divider} />
      <div className={styles.actions}>
        {children}
      </div>
      <span className={styles.divider} />
      <button
        type="button"
        className={styles.clearBtn}
        onClick={onClear}
      >
        Deseleccionar
      </button>
    </div>
  );
}

import styles from './Pagination.module.css';

/**
 * Pagination — Aelium Design System
 *
 * Renders page numbers with prev/next navigation,
 * ellipsis truncation, and optional result info.
 *
 * @example
 *   <Pagination page={2} totalPages={10} onPageChange={setPage} total={95} />
 *
 * Ref: docs/40-reference/DESIGN_SYSTEM.md
 */

export interface PaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Total items (for info display) */
  total?: number;
  /** Items per page (for info display) */
  limit?: number;
  /** Max visible page buttons (default: 5) */
  maxVisible?: number;
  /** Custom class */
  className?: string;
}

function getVisiblePages(current: number, total: number, maxVisible: number): (number | 'ellipsis')[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const half = Math.floor(maxVisible / 2);

  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);

  // Adjust range when near boundaries
  if (current <= half + 1) {
    end = Math.min(total - 1, maxVisible - 1);
  }
  if (current >= total - half) {
    start = Math.max(2, total - maxVisible + 2);
  }

  pages.push(1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  if (total > 1) pages.push(total);

  return pages;
}

const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export function Pagination({
  page, totalPages, onPageChange, total, limit, maxVisible = 5, className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getVisiblePages(page, totalPages, maxVisible);

  // Info text: "11-20 de 95"
  const infoText = total != null && limit != null
    ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total}`
    : null;

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {infoText && <span className={styles.info}>{infoText}</span>}
      {!infoText && <span />}

      <div className={styles.controls}>
        {/* Prev */}
        <button
          className={styles.navButton}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft />
        </button>

        {/* Page numbers */}
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className={styles.ellipsis}>…</span>
          ) : (
            <button
              key={p}
              className={`${styles.pageButton} ${p === page ? styles.active : ''}`}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        {/* Next */}
        <button
          className={styles.navButton}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

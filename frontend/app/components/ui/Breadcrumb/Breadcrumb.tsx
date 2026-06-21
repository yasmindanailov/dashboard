import Link from 'next/link';
import styles from './Breadcrumb.module.css';

/**
 * Breadcrumb — Aelium Design System
 *
 * Navigation breadcrumb with configurable items
 * and chevron separators.
 *
 * @example
 *   <Breadcrumb items={[
 *     { label: 'Facturación', href: '/dashboard/billing' },
 *     { label: 'INV-00042' },
 *   ]} />
 *
 * Ref: docs/40-reference/DESIGN_SYSTEM.md
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const ChevronSeparator = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav className={`${styles.nav} ${className}`} aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;

        return (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && (
              <span className={styles.separator} aria-hidden>
                <ChevronSeparator />
              </span>
            )}
            {isLast || !item.href ? (
              <span className={isLast ? styles.current : styles.link} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className={styles.link}>
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

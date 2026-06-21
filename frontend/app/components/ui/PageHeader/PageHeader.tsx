import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

/**
 * PageHeader — Aelium Design System
 *
 * Standard page header with title, optional subtitle,
 * and right-aligned action slot. Used in every list page
 * and detail page to enforce consistent anatomy.
 *
 * @example
 *   <PageHeader
 *     title="Clientes"
 *     subtitle="142 clientes registrados"
 *     action={<Button>+ Nuevo</Button>}
 *   />
 *
 * Ref: docs/40-reference/UI_SPEC.md §3.5, docs/40-reference/DESIGN_SYSTEM.md Regla D10
 */

export interface PageHeaderProps {
  /** Page title (h1) — required */
  title: string;
  /** Contextual subtitle with counters or description */
  subtitle?: string;
  /** Right-aligned action slot (typically a CTA Button) */
  action?: ReactNode;
  /** Override heading level for semantic flexibility */
  as?: 'h1' | 'h2';
  /** Optional class name */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  action,
  as: Tag = 'h1',
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`${styles.header} ${className}`}>
      <div className={styles.titleBlock}>
        <Tag className={styles.title}>{title}</Tag>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

export { PageHeader as default };

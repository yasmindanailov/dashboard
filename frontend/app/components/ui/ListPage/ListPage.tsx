import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderProps } from '../PageHeader/PageHeader';
import styles from './ListPage.module.css';

/**
 * ListPage — Aelium Design System
 *
 * Layout wrapper that enforces the standard list page
 * anatomy from UI_SPEC §2.4:
 *
 *   PageHeader → StatusTabs (opt) → FilterBar → Content → Pagination
 *
 * @example
 *   <ListPage
 *     title="Clientes"
 *     subtitle="142 clientes registrados"
 *     action={<Button>+ Nuevo</Button>}
 *     statusTabs={<StatusTabs ... />}
 *     filterBar={<FilterBar ... />}
 *     pagination={<Pagination ... />}
 *   >
 *     <Table ... />
 *   </ListPage>
 *
 * Ref: docs/UI_SPEC.md §2.4, docs/DESIGN_SYSTEM.md Regla D10
 */

export interface ListPageProps extends Omit<PageHeaderProps, 'className'> {
  /** Slot rendered between PageHeader and FilterBar */
  statusTabs?: ReactNode;
  /** Slot rendered between StatusTabs and content */
  filterBar?: ReactNode;
  /** Content rendered before PageHeader (e.g. AlertBanner) */
  banner?: ReactNode;
  /** Pagination slot rendered after children */
  pagination?: ReactNode;
  /** Main content (Table, Card list, etc.) */
  children: ReactNode;
  /** Use wider max-width (1400px instead of 1200px) */
  wide?: boolean;
  /** Optional class name on the root container */
  className?: string;
}

export function ListPage({
  title,
  subtitle,
  action,
  as,
  statusTabs,
  filterBar,
  banner,
  pagination,
  children,
  wide = false,
  className = '',
}: ListPageProps) {
  const rootClasses = [
    styles.container,
    wide && styles.wide,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClasses}>
      {/* PageHeader — §3.5 */}
      <PageHeader title={title} subtitle={subtitle} action={action} as={as} />

      {/* Banner slot (e.g. AlertBanner) */}
      {banner}

      {/* StatusTabs — §3.2 (when entity has finite statuses) */}
      {statusTabs}

      {/* FilterBar — §3.4 */}
      {filterBar}

      {/* Main content */}
      <div className={styles.content}>
        {children}
      </div>

      {/* Pagination */}
      {pagination}
    </div>
  );
}

export { ListPage as default };

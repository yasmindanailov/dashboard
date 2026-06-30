'use client';

import { type ReactNode, Suspense } from 'react';
import { Breadcrumb, type BreadcrumbItem } from '../Breadcrumb/Breadcrumb';
import ContextBackLink from '../ContextBackLink';
import styles from './DetailPage.module.css';

/**
 * DetailPage — Aelium Design System
 *
 * Layout wrapper that enforces the standard detail page
 * anatomy from UI_SPEC §2.5:
 *
 *   Breadcrumb → Header card → Tabs → Content
 *
 * @example
 *   <DetailPage
 *     breadcrumb={[
 *       { label: 'Clientes', href: '/admin/clients' },
 *       { label: 'Juan García' },
 *     ]}
 *     header={<ClientHeader client={client} />}
 *     tabs={[
 *       { key: 'resumen', label: 'Resumen' },
 *       { key: 'facturacion', label: 'Facturación' },
 *     ]}
 *     activeTab={tab}
 *     onTabChange={setTab}
 *   >
 *     {tab === 'resumen' && <ResumeContent />}
 *   </DetailPage>
 *
 * Ref: docs/40-reference/UI_SPEC.md §2.5, §2.8
 */

export interface DetailTab {
  /** Unique key for the tab */
  key: string;
  /** Display label */
  label: string;
  /** Contador opcional → píldora junto a la etiqueta (se muestra si > 0). */
  count?: number;
}

export interface DetailPageProps {
  /** Breadcrumb navigation items (§2.5: always required) */
  breadcrumb: BreadcrumbItem[];
  /** Entity header content (avatar, name, status, metadata) */
  header: ReactNode;
  /** Tab definitions */
  tabs?: DetailTab[];
  /** Currently active tab key */
  activeTab?: string;
  /** Callback when tab changes */
  onTabChange?: (key: string) => void;
  /** Content rendered below tabs */
  children: ReactNode;
  /** Use wider max-width (1400px instead of 1200px) */
  wide?: boolean;
  /** Optional class name on the root container */
  className?: string;
}

export function DetailPage({
  breadcrumb,
  header,
  tabs,
  activeTab,
  onTabChange,
  children,
  wide = false,
  className = '',
}: DetailPageProps) {
  const rootClasses = [
    styles.container,
    wide && styles.wide,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClasses}>
      {/* Cross-module back link (P6.1: non-client roles only) */}
      <Suspense fallback={null}>
        <ContextBackLink />
      </Suspense>

      {/* Breadcrumb navigation (§2.5: always present) */}
      <Breadcrumb items={breadcrumb} />

      {/* Entity header card */}
      <div className={styles.headerCard}>
        {header}
      </div>

      {/* Tab bar */}
      {tabs && tabs.length > 0 && (
        <div className={styles.tabBar} role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={`${styles.tabCount} ${activeTab === tab.key ? styles.tabCountActive : ''}`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {children}
    </div>
  );
}

export { DetailPage as default };

import type { ReactNode } from 'react';
import { Breadcrumb, type BreadcrumbItem } from '../Breadcrumb/Breadcrumb';
import styles from './FormPage.module.css';

/**
 * FormPage — Aelium Design System Layout (§2.6)
 *
 * Enforces the Form Page anatomy from UI_SPEC.md:
 *   1. Breadcrumb (always)
 *   2. Form header (h1 only, no subtitle or CTA)
 *   3. Form sections (children — use Card with section titles)
 *   4. Form actions (sticky bottom: Cancel + Submit)
 *
 * @example
 *   <FormPage
 *     breadcrumb={[
 *       { label: 'Productos', href: '/dashboard/products' },
 *       { label: 'Nuevo producto' },
 *     ]}
 *     title="Nuevo producto"
 *     actions={
 *       <>
 *         <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
 *         <Button type="submit" loading={saving}>Guardar</Button>
 *       </>
 *     }
 *   >
 *     <Card>...</Card>
 *   </FormPage>
 *
 * Ref: UI_SPEC.md §2.6, DESIGN_SYSTEM.md
 */

export interface FormPageProps {
  /** Breadcrumb navigation items */
  breadcrumb: BreadcrumbItem[];
  /** Page title — h1, no subtitle or CTA */
  title: string;
  /** Form sections — should be Card components */
  children: ReactNode;
  /** Sticky action bar content — typically Cancel + Submit buttons */
  actions?: ReactNode;
  /** Optional className override */
  className?: string;
}

export function FormPage({ breadcrumb, title, children, actions, className = '' }: FormPageProps) {
  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <Breadcrumb items={breadcrumb} />
        <h1 className={styles.title}>{title}</h1>
      </div>

      {children}

      {actions && (
        <div className={styles.actions}>
          {actions}
        </div>
      )}
    </div>
  );
}

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
 *   4. Form actions (footer by default; `headerActions` para acciones en la
 *      cabecera junto al título — UI_SPEC §2.6 Amendment A1, F4·U27: algunos
 *      mockups sitúan las acciones en la cabecera del form. Additivo: por
 *      defecto las acciones siguen al pie vía `actions`.)
 *
 * @example
 *   <FormPage
 *     breadcrumb={[
 *       { label: 'Productos', href: '/admin/products' },
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
  /** Footer action bar content — typically Cancel + Submit buttons */
  actions?: ReactNode;
  /**
   * Acciones en la CABECERA (junto al título, alineadas a la derecha). Additivo
   * (UI_SPEC §2.6 Amendment A1): para mockups que colocan las acciones arriba
   * (p. ej. ProductoForm — "Cambiar tipo" + "Crear X"). Si se usa, no repetir en
   * `actions`.
   */
  headerActions?: ReactNode;
  /** Optional className override */
  className?: string;
}

export function FormPage({
  breadcrumb,
  title,
  children,
  actions,
  headerActions,
  className = '',
}: FormPageProps) {
  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <Breadcrumb items={breadcrumb} />
        {headerActions ? (
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            <div className={styles.headerActions}>{headerActions}</div>
          </div>
        ) : (
          <h1 className={styles.title}>{title}</h1>
        )}
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

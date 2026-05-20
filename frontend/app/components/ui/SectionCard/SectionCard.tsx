import type { ReactNode } from 'react';
import styles from './SectionCard.module.css';

/**
 * SectionCard — Aelium Design System (Sprint 15C.II Fase F.12.5, Amendment V).
 *
 * Cromo de sección **read-only** canónico: card con título + subtítulo opcional
 * + slot de acciones a la derecha + cuerpo. Reemplaza el patrón ad-hoc
 * `<Card><h2 style={…}>…` repetido por las cards del detalle de servicio.
 *
 * Distinta de `EditorSectionCard` (ADR-075 §B.2), que es para **formularios**
 * con footer "Guardar cambios"/estado dirty. `SectionCard` NO tiene footer ni
 * estado: presenta información (con CTAs opcionales en el slot `actions`).
 *
 * Server-component compatible: sin hooks, sin estado. Tokens only.
 *
 * @example
 *   <SectionCard title="SSL" actions={<Badge variant="success">Activo</Badge>}>
 *     <p>Expira en 60 días.</p>
 *   </SectionCard>
 */
export interface SectionCardProps {
  /** Título de la sección (`<h2>`). */
  title: ReactNode;
  /** Subtítulo opcional bajo el título. */
  subtitle?: ReactNode;
  /** Slot de acciones a la derecha del título (Badge, Button, Dropdown…). */
  actions?: ReactNode;
  /** Cuerpo de la sección. */
  children: ReactNode;
  /** id explícito para `aria-labelledby`. Por defecto se deriva del título si es string. */
  headingId?: string;
  /** Override de clase para casos puntuales (ej. ocupar toda la fila del grid). */
  className?: string;
}

function slugifyTitle(title: ReactNode): string | undefined {
  if (typeof title !== 'string') return undefined;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug ? `section-card-${slug}` : undefined;
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  headingId,
  className = '',
}: SectionCardProps) {
  const hid = headingId ?? slugifyTitle(title);
  return (
    <section className={`${styles.card} ${className}`.trim()} aria-labelledby={hid}>
      <header className={styles.header}>
        <div className={styles.headingWrap}>
          <h2 id={hid} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

import type { ReactNode } from 'react';
import styles from './DangerZone.module.css';

/**
 * DangerZone — Aelium Design System (Sprint 15C.II Fase F.12.5, Amendment V).
 *
 * Sección aislada para operaciones consecuentes/destructivas (patrón GitHub /
 * DigitalOcean): borde + tinte rojo sutil + título de peligro. Separa
 * visualmente lo destructivo de las operaciones seguras (Regla D5 — las
 * destructivas siguen abriendo modal de confirmación; la zona es el
 * agrupador, no sustituye la confirmación).
 *
 * Read-only chrome: presenta el título + descripción + los controles (botones)
 * como children. Server-component compatible (sin hooks); los children pueden
 * ser Client Components con sus modales. Tokens only.
 *
 * @example
 *   <DangerZone title="Zona de peligro" description="Acciones que afectan al acceso del cliente.">
 *     <Button variant="danger" onClick={…}>Suspender servicio…</Button>
 *     <Button variant="danger" onClick={…}>Cancelar servicio…</Button>
 *   </DangerZone>
 */
export interface DangerZoneProps {
  /** Título de la zona (`<h2>`, color de peligro). */
  title: ReactNode;
  /** Descripción opcional bajo el título. */
  description?: ReactNode;
  /** Controles de la zona (botones que abren modales de confirmación). */
  children: ReactNode;
  /** Override de clase para casos puntuales (ej. ocupar toda la fila del grid). */
  className?: string;
}

export function DangerZone({
  title,
  description,
  children,
  className = '',
}: DangerZoneProps) {
  return (
    <section
      className={`${styles.zone} ${className}`.trim()}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {description && <p className={styles.description}>{description}</p>}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

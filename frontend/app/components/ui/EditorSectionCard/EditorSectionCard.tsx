'use client';

import type { ReactNode } from 'react';
import { Button } from '../Button';
import styles from './EditorSectionCard.module.css';

/**
 * EditorSectionCard — Aelium Design System (Sprint 8 Fase D + ADR-075 §B.2)
 *
 * Card de sección editable para editores con layout "lista vertical de
 * secciones extensibles" (admin Support Inside, futuras secciones de
 * settings, plantillas por plan, etc.).
 *
 * Patrón canónico: cada card representa **un dominio atómico** del
 * recurso editable (Identidad, Precios, Slots, Soporte, Avanzada). Cada
 * card guarda su propio subset con un botón "Guardar cambios" propio
 * (NO auto-save — ADR-075 §B.2 "el admin guarda explícitamente para
 * evitar afectar suscripciones activas a mitad de edición").
 *
 * Flujo dirty:
 *   - Si `dirty` es true, la card muestra punto warning + banner pequeño
 *     y el botón "Guardar cambios" se habilita.
 *   - Si `dirty` es false, el botón se deshabilita y no aparece banner.
 *
 * Cómo añadir una sección nueva en sprints futuros:
 *   1. Definir el subset del DTO que cubre (sección Notificaciones,
 *      sección IA copilot, etc.).
 *   2. Renderizar `<EditorSectionCard>` con sus campos como children.
 *   3. AÑADIR al final, NO redistribuir entre cards existentes (rompe
 *      muscle memory del admin — ADR-075 §B.2).
 *
 * @example
 *   <EditorSectionCard
 *     title="Identidad"
 *     description="Nombre visible, descripción del plan y estado activo."
 *     dirty={form.dirty.identity}
 *     saving={form.saving.identity}
 *     onSave={() => form.save('identity')}
 *     onReset={() => form.reset('identity')}
 *   >
 *     <Input label="Nombre" ... />
 *     <Textarea label="Descripción" ... />
 *   </EditorSectionCard>
 */
export interface EditorSectionCardProps {
  /** Título de la sección (ej. "Identidad", "Precios"). */
  title: string;
  /** Descripción corta opcional debajo del título. */
  description?: string;
  /** Children = campos editables (Input, Select, Textarea, ...). */
  children: ReactNode;
  /** Si la sección tiene cambios sin guardar. */
  dirty: boolean;
  /** Si la sección está guardando ahora mismo (botón en loading). */
  saving?: boolean;
  /** Handler de "Guardar cambios". Sólo se llama si dirty=true. */
  onSave: () => void;
  /** Handler opcional para descartar cambios y volver al snapshot. */
  onReset?: () => void;
  /** Texto override del botón (default: "Guardar cambios"). */
  saveLabel?: string;
  /** Hint pequeño en el footer (ej. "Cambios afectan a clientes nuevos"). */
  hint?: string;
  /** className opcional para overrides puntuales. */
  className?: string;
}

export function EditorSectionCard({
  title,
  description,
  children,
  dirty,
  saving = false,
  onSave,
  onReset,
  saveLabel = 'Guardar cambios',
  hint,
  className = '',
}: EditorSectionCardProps) {
  return (
    <section
      className={`${styles.card} ${dirty ? styles.cardDirty : ''} ${className}`}
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className={styles.title}
          >
            {title}
          </h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {dirty && <span aria-hidden="true" className={styles.dirtyDot} />}
      </header>

      <div className={styles.body}>{children}</div>

      <footer className={styles.footer}>
        <div>
          {dirty && (
            <span className={styles.dirtyBanner}>Cambios sin guardar</span>
          )}
          {!dirty && hint && <p className={styles.footerHint}>{hint}</p>}
        </div>
        <div className={styles.footerActions}>
          {onReset && dirty && (
            <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
              Descartar
            </Button>
          )}
          <Button
            size="sm"
            onClick={onSave}
            disabled={!dirty || saving}
            loading={saving}
          >
            {saveLabel}
          </Button>
        </div>
      </footer>
    </section>
  );
}

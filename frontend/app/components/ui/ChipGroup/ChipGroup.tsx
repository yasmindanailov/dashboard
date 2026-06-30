'use client';

import styles from './ChipGroup.module.css';

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipGroupProps {
  options: ChipOption[];
  /** Valor seleccionado (selección única). */
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
  className?: string;
}

/**
 * ChipGroup — primitiva del DS (F3·E10, derivada del mockup de notificaciones).
 * Fila de chips-toggle de filtro (pills): activo = sólido oscuro, inactivo =
 * blanco con borde. Selección única. Distinta del SegmentedControl (pista gris):
 * se usa para filtros por categoría con muchas opciones que pueden envolver.
 */
export function ChipGroup({
  options,
  value,
  onChange,
  className = '',
  ...aria
}: ChipGroupProps) {
  return (
    <div
      role="tablist"
      aria-label={aria['aria-label']}
      className={`${styles.group} ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`${styles.chip} ${active ? styles.active : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

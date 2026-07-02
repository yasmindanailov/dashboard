'use client';

import styles from './ChipGroup.module.css';

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipGroupCommonProps {
  options: ChipOption[];
  'aria-label'?: string;
  className?: string;
}

/** Selección única (por defecto) — compatible con el uso previo (E10). */
export interface ChipGroupSingleProps extends ChipGroupCommonProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

/** Multi-selección (F4·W3·U04) — varios chips activos a la vez. */
export interface ChipGroupMultiProps extends ChipGroupCommonProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type ChipGroupProps = ChipGroupSingleProps | ChipGroupMultiProps;

/**
 * ChipGroup — primitiva del DS (F3·E10, derivada del mockup de notificaciones).
 * Fila de chips-toggle de filtro (pills): activo = sólido oscuro, inactivo =
 * blanco con borde. Envuelve si hay muchas opciones. Distinta del
 * SegmentedControl (pista gris): filtros por categoría con muchas opciones.
 *
 * F4·W3·U04: soporta **multi-selección** (`multiple`) — varios chips activos a la
 * vez (a11y `role=group` + `aria-pressed`). El modo único (default) mantiene
 * `role=tab` + `aria-selected` (contrato previo intacto).
 */
export function ChipGroup(props: ChipGroupProps) {
  const { options, className = '' } = props;
  const ariaLabel = props['aria-label'];

  const isActive = (value: string): boolean =>
    props.multiple ? props.value.includes(value) : props.value === value;

  const toggle = (value: string): void => {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((v) => v !== value)
          : [...props.value, value],
      );
    } else {
      props.onChange(value);
    }
  };

  return (
    <div
      role={props.multiple ? 'group' : 'tablist'}
      aria-label={ariaLabel}
      className={`${styles.group} ${className}`}
    >
      {options.map((opt) => {
        const active = isActive(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role={props.multiple ? undefined : 'tab'}
            aria-selected={props.multiple ? undefined : active}
            aria-pressed={props.multiple ? active : undefined}
            onClick={() => toggle(opt.value)}
            className={`${styles.chip} ${active ? styles.active : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

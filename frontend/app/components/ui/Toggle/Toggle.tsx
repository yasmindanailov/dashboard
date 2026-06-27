'use client';

import styles from './Toggle.module.css';

export interface ToggleProps {
  /** Estado controlado del switch. */
  checked: boolean;
  /** Callback con el nuevo estado al pulsar. */
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Etiqueta accesible (usa una de las dos). */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/**
 * Toggle / Switch — primitiva del DS (F1a). Spec del mockup: track 42×24,
 * knob 18×18 que translada 18px; on = `--brand`, off = `--border-hover`.
 * `role="switch"` + `aria-checked` para accesibilidad. Controlado.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  id,
  className = '',
  ...aria
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${styles.track} ${checked ? styles.on : ''} ${className}`}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}

'use client';

import type { LucideIcon } from 'lucide-react';

import styles from './SegmentedControl.module.css';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
  className?: string;
}

/**
 * SegmentedControl — primitiva del DS (F1a). Spec del mockup: pista
 * `--surface-tertiary` con tab activo en "tarjeta" blanca + sombra sutil.
 * Usado para "Por nombre / Con IA", prioridad SI, ciclo de facturación.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  className = '',
  ...aria
}: SegmentedControlProps) {
  return (
    <div role="tablist" aria-label={aria['aria-label']} className={`${styles.track} ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`${styles.seg} ${active ? styles.active : ''}`}
          >
            {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

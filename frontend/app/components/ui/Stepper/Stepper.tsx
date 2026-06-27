import { Check } from 'lucide-react';

import styles from './Stepper.module.css';

export interface StepperProps {
  /** Etiquetas de los pasos, en orden. */
  steps: string[];
  /** Índice 0-based del paso actual (anteriores = completados). */
  current: number;
  className?: string;
}

/**
 * Stepper — primitiva del DS (F1a). Spec del mockup (checkout): pasos con
 * círculo (completado = check + brand-light · actual = brand sólido + nº ·
 * pendiente = slate) y conectores. Para checkout y onboarding.
 */
export function Stepper({ steps, current, className = '' }: StepperProps) {
  return (
    <div className={`${styles.wrap} ${className}`}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'pending';
        return (
          <div key={label} className={styles.group}>
            <div className={styles.step}>
              <span className={`${styles.circle} ${styles[state]}`}>
                {state === 'done' ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`${styles.label} ${state === 'current' ? styles.labelCurrent : ''}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`${styles.connector} ${i < current ? styles.connectorDone : ''}`} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

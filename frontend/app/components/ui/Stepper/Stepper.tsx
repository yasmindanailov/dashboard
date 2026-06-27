import { Check } from 'lucide-react';

import styles from './Stepper.module.css';

export interface StepperStep {
  label: string;
  /** Subtexto (solo se muestra en orientación vertical). */
  sub?: string;
}

export interface StepperProps {
  /** Pasos: strings o `{ label, sub }`. */
  steps: (string | StepperStep)[];
  /** Índice 0-based del paso actual (anteriores = completados). */
  current: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const norm = (s: string | StepperStep): StepperStep => (typeof s === 'string' ? { label: s } : s);
const stateOf = (i: number, current: number) => (i < current ? 'done' : i === current ? 'current' : 'pending');

/**
 * Stepper — primitiva del DS (F1a). Horizontal (checkout, spec Carrito/Confirmar)
 * o vertical (FSM de transferencia, spec TransferenciaDominio: círculo + conector
 * vertical + label/sub). Completado=check+brand-light · actual=brand · pendiente=slate.
 */
export function Stepper({ steps, current, orientation = 'horizontal', className = '' }: StepperProps) {
  const items = steps.map(norm);

  if (orientation === 'vertical') {
    return (
      <div className={`${styles.vwrap} ${className}`}>
        {items.map((step, i) => {
          const state = stateOf(i, current);
          const last = i === items.length - 1;
          return (
            <div key={step.label} className={styles.vgroup}>
              <div className={styles.vlead}>
                <span className={`${styles.circle} ${styles[state]}`}>
                  {state === 'done' ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : i + 1}
                </span>
                {!last && (
                  <span className={`${styles.vconnector} ${i < current ? styles.connectorDone : ''}`} aria-hidden="true" />
                )}
              </div>
              <div className={styles.vbody}>
                <span className={`${styles.label} ${state === 'current' ? styles.labelCurrent : ''}`}>{step.label}</span>
                {step.sub && <span className={styles.vsub}>{step.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} ${className}`}>
      {items.map((step, i) => {
        const state = stateOf(i, current);
        return (
          <div key={step.label} className={styles.group}>
            <div className={styles.step}>
              <span className={`${styles.circle} ${styles[state]}`}>
                {state === 'done' ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`${styles.label} ${state === 'current' ? styles.labelCurrent : ''}`}>{step.label}</span>
            </div>
            {i < items.length - 1 && (
              <span className={`${styles.connector} ${i < current ? styles.connectorDone : ''}`} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

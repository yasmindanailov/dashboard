import type { ReactNode } from 'react';

import styles from './OrderSummary.module.css';

export interface OrderSummaryLine {
  label: string;
  /** Valor ya formateado (ej: "115,20 €" o "Gratis"). */
  value: string;
  /** Pinta el valor en verde (ej: "Gratis"). */
  free?: boolean;
  /** Línea con separador superior (inicio del bloque de subtotales). */
  divider?: boolean;
}

export interface OrderSummaryProps {
  title?: string;
  lines: OrderSummaryLine[];
  totalLabel?: string;
  /** Total ya formateado (ej: "115,20 €"). */
  totalValue: string;
  /** Fija el resumen (position: sticky; top: 80px). */
  sticky?: boolean;
  /** CTA + notas debajo del total. */
  children?: ReactNode;
  className?: string;
}

/**
 * OrderSummary — primitiva del DS (F1a). Resumen de pedido del mockup
 * (Confirmar): líneas label/valor con desglose IVA + total destacado, sticky
 * opcional. El CTA "Pagar" y las notas van como children.
 */
export function OrderSummary({
  title = 'Resumen',
  lines,
  totalLabel = 'Total hoy',
  totalValue,
  sticky = false,
  children,
  className = '',
}: OrderSummaryProps) {
  return (
    <div className={`${styles.box} ${sticky ? styles.sticky : ''} ${className}`}>
      <h3 className={styles.title}>{title}</h3>
      {lines.map((line, i) => (
        <div key={`${line.label}-${i}`} className={`${styles.line} ${line.divider ? styles.divider : ''}`}>
          <span className={styles.label}>{line.label}</span>
          <span className={`${styles.value} ${line.free ? styles.free : ''}`}>{line.value}</span>
        </div>
      ))}
      <div className={`${styles.line} ${styles.totalRow}`}>
        <span className={styles.totalLabel}>{totalLabel}</span>
        <span className={styles.totalValue}>{totalValue}</span>
      </div>
      {children}
    </div>
  );
}

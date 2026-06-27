import type { LucideIcon } from 'lucide-react';
import { CreditCard } from 'lucide-react';

import { IconWell } from '../IconWell';
import styles from './PaymentMethodCard.module.css';

export interface PaymentMethodCardProps {
  icon?: LucideIcon;
  /** Eyebrow en mayúsculas (mockup: "Pago" / "Perfil"). */
  label: string;
  /** Línea principal (ej: "Visa •••• 4242"). */
  title: string;
  /** Línea secundaria (ej: "vía Stripe · caduca 06/27"). */
  subtitle?: string;
  className?: string;
}

/**
 * PaymentMethodCard — primitiva del DS (F1a). Tarjeta con icono + eyebrow +
 * título + subtítulo (spec del mockup Confirmar; el mismo patrón sirve para
 * el método de pago y el perfil de facturación). Presentacional.
 */
export function PaymentMethodCard({
  icon = CreditCard,
  label,
  title,
  subtitle,
  className = '',
}: PaymentMethodCardProps) {
  return (
    <div className={`${styles.card} ${className}`}>
      <IconWell icon={icon} tone="brand" size="sm" />
      <span className={styles.content}>
        <span className={styles.label}>{label}</span>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </div>
  );
}

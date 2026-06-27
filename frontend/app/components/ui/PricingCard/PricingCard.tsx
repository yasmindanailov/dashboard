'use client';

import { Check } from 'lucide-react';

import styles from './PricingCard.module.css';

export interface PricingCardProps {
  name: string;
  description?: string;
  /** Precio ya formateado (ej: "12 €"). */
  price: string;
  /** Antepone "desde". */
  showFrom?: boolean;
  /** Periodo (ej: "/mes"). */
  period?: string;
  /** Nota bajo el precio (ej: "facturado anual · IVA incl."). */
  priceNote?: string;
  features: string[];
  /** Variante destacada (borde brand + sombra). */
  highlighted?: boolean;
  /** Etiqueta flotante (mockup: "Recomendado" brand / "Tu plan actual" success). */
  badge?: { label: string; tone?: 'brand' | 'success' };
  ctaLabel: string;
  onCta?: () => void;
  className?: string;
}

/**
 * PricingCard — primitiva del DS (F1a). Tarjeta de plan del mockup (Tienda):
 * precio "desde X €/mes", lista de features con check, CTA, y variante
 * destacada con badge flotante.
 */
export function PricingCard({
  name,
  description,
  price,
  showFrom = false,
  period,
  priceNote,
  features,
  highlighted = false,
  badge,
  ctaLabel,
  onCta,
  className = '',
}: PricingCardProps) {
  return (
    <div className={`${styles.card} ${highlighted ? styles.highlighted : ''} ${className}`}>
      {badge && (
        <span className={`${styles.badge} ${badge.tone === 'success' ? styles.badgeSuccess : ''}`}>
          {badge.label}
        </span>
      )}
      <div className={styles.name}>{name}</div>
      {description && <div className={styles.description}>{description}</div>}
      <div className={styles.priceRow}>
        {showFrom && <span className={styles.from}>desde</span>}
        <span className={styles.price}>{price}</span>
        {period && <span className={styles.period}>{period}</span>}
      </div>
      {priceNote && <div className={styles.priceNote}>{priceNote}</div>}
      <div className={styles.features}>
        {features.map((f) => (
          <div key={f} className={styles.feature}>
            <Check size={15} strokeWidth={2} className={styles.check} aria-hidden="true" />
            {f}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onCta}
        className={`${styles.cta} ${highlighted ? styles.ctaPrimary : ''}`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

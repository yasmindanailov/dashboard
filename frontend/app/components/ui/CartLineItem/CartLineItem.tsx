'use client';

import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

import { Badge, type BadgeVariant } from '../Badge';
import styles from './CartLineItem.module.css';

export interface CartLineItemProps {
  icon: LucideIcon;
  name: string;
  badge?: { label: string; variant?: BadgeVariant };
  sub?: string;
  /** Nota de renovación (ej: "Se renueva el 14 jun 2027"). */
  renewNote?: string;
  /** Aviso ámbar opcional (ej: elegibilidad). */
  warning?: string;
  /** Precio formateado (ej: "115,20 €"). */
  price: string;
  /** Precio original tachado (ej: descuento). */
  originalPrice?: string;
  /** Periodo bajo el precio (ej: "/año"). */
  term?: string;
  /** Pinta el precio en verde (ej: "Gratis"). */
  priceFree?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
  className?: string;
}

/**
 * CartLineItem — fila de carrito del mockup (Carrito): icon-well + nombre/badge +
 * subtítulo + nota de renovación + aviso opcional + acciones (Editar/Quitar) +
 * precio (con tachado opcional). Para la página de carrito (F4).
 */
export function CartLineItem({
  icon: Icon,
  name,
  badge,
  sub,
  renewNote,
  warning,
  price,
  originalPrice,
  term,
  priceFree = false,
  onEdit,
  onRemove,
  className = '',
}: CartLineItemProps) {
  return (
    <div className={`${styles.row} ${className}`}>
      <span className={styles.iconWell} aria-hidden="true">
        <Icon size={23} strokeWidth={1.7} />
      </span>

      <div className={styles.content}>
        <div className={styles.titleRow}>
          <span className={styles.name}>{name}</span>
          {badge && <Badge variant={badge.variant ?? 'brand'}>{badge.label}</Badge>}
        </div>
        {sub && <div className={styles.sub}>{sub}</div>}
        {renewNote && (
          <div className={styles.renew}>
            <RefreshCw size={13} strokeWidth={1.7} aria-hidden="true" />
            {renewNote}
          </div>
        )}
        {warning && (
          <div className={styles.warning}>
            <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
            <span>{warning}</span>
          </div>
        )}
        {(onEdit || onRemove) && (
          <div className={styles.actions}>
            {onEdit && (
              <button type="button" onClick={onEdit} className={styles.edit}>
                <Pencil size={13} strokeWidth={2} aria-hidden="true" />
                Editar
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={onRemove} className={styles.remove}>
                <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                Quitar
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.priceCol}>
        {originalPrice && <div className={styles.original}>{originalPrice}</div>}
        <div className={`${styles.price} ${priceFree ? styles.free : ''}`}>{price}</div>
        {term && <div className={styles.term}>{term}</div>}
      </div>
    </div>
  );
}

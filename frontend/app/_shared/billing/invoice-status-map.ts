/**
 * Canónico de mapeo invoice.status → UI label + Badge variant.
 *
 * Sprint 9.6 (ADR-066 Fase E): centralizado para que `/admin/billing/*` y
 * `/dashboard/billing/*` rendericen los mismos textos y colores. Era
 * duplicación pre-Sprint en cada page.tsx.
 */

import type { BadgeVariant } from '../../components/ui';

export interface InvoiceStatusInfo {
  label: string;
  variant: BadgeVariant;
}

export const INVOICE_STATUS_MAP: Record<string, InvoiceStatusInfo> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  pending: { label: 'Pendiente', variant: 'warning' },
  paid: { label: 'Pagada', variant: 'success' },
  overdue: { label: 'Vencida', variant: 'danger' },
  cancelled: { label: 'Cancelada', variant: 'neutral' },
  refunded: { label: 'Reembolsada', variant: 'info' },
};

/**
 * Devuelve el `InvoiceStatusInfo` para un status dado, con fallback seguro
 * a `draft` si llega un status inesperado.
 */
export function getInvoiceStatusInfo(status: string): InvoiceStatusInfo {
  return INVOICE_STATUS_MAP[status] ?? INVOICE_STATUS_MAP.draft;
}

/**
 * Formato de divisa locale-aware (es-ES). Reutilizable desde admin y cliente.
 */
export function fmtCurrency(amount: string | number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(Number(amount));
}

/**
 * Fechas cortas dd/mm/yyyy (lista de facturas) y largas "dd de mes yyyy"
 * (detalle de factura). Centralizadas para que admin y cliente coincidan.
 */
export function fmtDateShort(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function fmtDateLong(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

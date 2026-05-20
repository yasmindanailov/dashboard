/**
 * BillingCrossLinkCard — Sprint 15C.II Fase F.11.3 (R3-derivado
 * §A.11.10.8.2 + L16 frozen F.7/F.8/F.10).
 *
 * Card resumen del cross-link entre el Service y su billing — visible
 * en `/dashboard/services/[id]` (cliente) y `/admin/services/[id]`
 * (admin). Cierra el cabo "cuándo vence" + "última factura emitida".
 *
 * Doctrina (R3 frozen — L16 SÍ aplica aquí, vs F.11.1 ProviderHealthBadge
 * que NO la aplica):
 *   - Cliente y admin necesitan la MISMA información del cross-link
 *     (next renewal + last invoice). El componente vive en `_shared/`
 *     con prop `isAdmin?: boolean` (default false). La única diferencia:
 *     el `href` del link "Ver factura" ramifica entre `/dashboard/billing/[id]`
 *     (cliente) y `/admin/billing/[id]` (admin).
 *   - Capability-driven por presencia (mismo patrón A5/A6/A7/A8/A9):
 *     si NO hay `nextDueDate` Y NO hay `lastInvoice` → `null` (service
 *     legacy / pending no facturado).
 *   - Server-component compatible — sin hooks, sin estado, sin Server
 *     Actions. Strings vía `t()` del módulo `_shared/i18n`.
 *
 * Heredable a 15D RC / 15E Docker / 15G Plesk: cualquier service con
 * billing asociado renderiza este card sin tocar el plugin.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge, SectionCard, type BadgeVariant } from '../../components/ui';
import { t } from '../../_shared/i18n';
import type { InvoiceStatus, ServiceBillingCrossLink } from '../../lib/api';
import styles from './service-detail.module.css';

interface BillingCrossLinkCardProps {
  data: ServiceBillingCrossLink;
  /**
   * Si `true`, el link "Ver factura" apunta a `/admin/billing/[id]`. Si
   * `false` (default), apunta a `/dashboard/billing/[id]`. L16.
   */
  isAdmin?: boolean;
  /**
   * Sprint 15C.II F.12.5 (Amendment VIII): si el servicio es terminal
   * (cancelado/terminado), se oculta "Próxima renovación" — un servicio
   * cancelado no renueva (sería incoherente). Se conserva la última factura
   * (histórico). Default `false`.
   */
  isTerminal?: boolean;
}

const INVOICE_STATUS_TO_BADGE_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  draft: 'neutral',
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
  refunded: 'neutral',
};

const INVOICE_STATUS_TO_LABEL_KEY: Record<InvoiceStatus, string> = {
  draft: 'service.billing_cross_link.invoice_status.draft',
  pending: 'service.billing_cross_link.invoice_status.pending',
  paid: 'service.billing_cross_link.invoice_status.paid',
  overdue: 'service.billing_cross_link.invoice_status.overdue',
  cancelled: 'service.billing_cross_link.invoice_status.cancelled',
  refunded: 'service.billing_cross_link.invoice_status.refunded',
};

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: string | null, currency: string): string | null {
  if (!amount) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Currency code inválido (defense): fallback a formato libre.
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function BillingCrossLinkCard({
  data,
  isAdmin = false,
  isTerminal = false,
}: BillingCrossLinkCardProps): ReactNode {
  const nextDateLabel = formatDate(data.nextDueDate);
  const nextAmountLabel = formatCurrency(data.amount, data.currency);
  // Servicio terminal: NO mostramos próxima renovación (no renueva — Amendment
  // VIII); solo el histórico de la última factura.
  const showNextRenewal = Boolean(nextDateLabel && nextAmountLabel) && !isTerminal;

  if (!showNextRenewal && !data.lastInvoice) {
    // Capability-driven por presencia: nada que mostrar.
    return null;
  }

  const invoiceHref = data.lastInvoice
    ? isAdmin
      ? `/admin/billing/${data.lastInvoice.id}`
      : `/dashboard/billing/${data.lastInvoice.id}`
    : null;
  const invoiceStatus = data.lastInvoice?.status;
  const invoiceTotal = data.lastInvoice
    ? formatCurrency(data.lastInvoice.total, data.currency)
    : null;
  const invoiceDueLabel = data.lastInvoice
    ? formatDate(data.lastInvoice.due_date)
    : null;

  return (
    <SectionCard title={t('service.billing_cross_link.card_title')}>
      {showNextRenewal && (
        <p className={styles.cardText}>
          {t('service.billing_cross_link.next_renewal_prefix')}
          <strong>{nextDateLabel}</strong>
          {' · '}
          <strong>{nextAmountLabel}</strong>
        </p>
      )}

      {data.lastInvoice && invoiceHref && invoiceTotal && (
        <div className={styles.inlineRow}>
          <span className={styles.cardTextMuted}>
            {t('service.billing_cross_link.last_invoice_prefix')}
            <strong className={styles.strongPrimary}>
              {data.lastInvoice.invoice_number}
            </strong>
            {invoiceDueLabel && (
              <span>
                {' ('}
                {t('service.billing_cross_link.due_prefix')}
                {invoiceDueLabel})
              </span>
            )}
          </span>
          {invoiceStatus && (
            <Badge variant={INVOICE_STATUS_TO_BADGE_VARIANT[invoiceStatus]}>
              {t(INVOICE_STATUS_TO_LABEL_KEY[invoiceStatus])}
            </Badge>
          )}
          <span className={styles.cardTextMuted}>{invoiceTotal}</span>
          <Link
            href={invoiceHref}
            className={`${styles.ctaText} ${styles.pushEnd}`}
          >
            {t('service.billing_cross_link.view_invoice')} →
          </Link>
        </div>
      )}

      {!data.lastInvoice && (
        <p className={styles.cardTextSubtle}>
          {t('service.billing_cross_link.no_invoice_yet')}
        </p>
      )}
    </SectionCard>
  );
}

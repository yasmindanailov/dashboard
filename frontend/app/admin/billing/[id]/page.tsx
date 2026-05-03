/**
 * /admin/billing/[id] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Mutaciones (finalize/pay/cancel/refund/PDF)
 * via Server Actions en Client island `InvoiceActions`. ADR-078 Amendment A1.
 */

import Link from 'next/link';
import { Badge, Card, DetailPage } from '../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import {
  fmtCurrency,
  fmtDateLong,
  getInvoiceStatusInfo,
} from '../../../_shared/billing/invoice-status-map';
import styles from '../../../_shared/billing/invoiceDetail.module.css';
import InvoiceActions from './_components/InvoiceActions';

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  discount_amount: string;
  total: string;
  currency: string;
  due_date: string;
  paid_at: string | null;
  payment_provider: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  is_manual: boolean;
  retry_count: number;
  max_retries: number;
  notes: string | null;
  created_at: string;
  billing_profile?: {
    label: string;
    company_name?: string;
    first_name?: string;
    last_name?: string;
    nif_cif?: string;
    address_line1?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  } | null;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unit_price: string;
    setup_fee: string;
    discount_pct: string | null;
    total: string;
    period_start: string | null;
    period_end: string | null;
  }[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminInvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let invoice: InvoiceDetail | null = null;
  try {
    invoice = await serverFetch<InvoiceDetail>(`/billing/invoices/${id}`);
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  if (!invoice) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
        Factura no encontrada.{' '}
        <Link
          href="/admin/billing"
          style={{ color: 'var(--brand)', textDecoration: 'none' }}
        >
          Volver
        </Link>
      </div>
    );
  }

  const st = getInvoiceStatusInfo(invoice.status);
  const bp = invoice.billing_profile;

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Facturación', href: '/admin/billing' },
        { label: invoice.invoice_number },
      ]}
      wide
      header={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {invoice.invoice_number}
              </h1>
              <Badge variant={st.variant}>{st.label}</Badge>
              {invoice.is_manual && <Badge variant="neutral">Manual</Badge>}
            </div>
            <div className={styles.headerMeta}>
              Emitida: {fmtDateLong(invoice.created_at)} · Vencimiento:{' '}
              {fmtDateLong(invoice.due_date)}
              {invoice.paid_at && (
                <>
                  {' '}
                  ·{' '}
                  <span className={styles.headerMetaPaid}>
                    Pagada: {fmtDateLong(invoice.paid_at)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className={styles.actions}>
            <InvoiceActions
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoice_number}
              status={invoice.status}
            />
          </div>
        </div>
      }
    >
      <div className={styles.grid}>
        <Card>
          <h3 className={styles.sectionTitle}>
            {bp?.nif_cif ? 'Factura completa' : 'Factura simplificada'}
          </h3>
          {invoice.user && (
            <div
              style={{
                marginBottom: 'var(--space-2_5)',
                paddingBottom: 'var(--space-2_5)',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              <span className={styles.infoBlockLabel}>CLIENTE</span>
              <Link
                href={`/admin/clients/${invoice.user.id}`}
                style={{
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--brand)',
                  textDecoration: 'none',
                }}
              >
                {invoice.user.first_name} {invoice.user.last_name}
              </Link>
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  marginLeft: 'var(--space-2)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {invoice.user.email}
              </span>
            </div>
          )}
          {bp ? (
            <div className={styles.infoBlock}>
              <span className={styles.infoBlockLabel}>PERFIL DE FACTURACIÓN</span>
              {bp.company_name && (
                <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                  {bp.company_name}
                </div>
              )}
              {(bp.first_name || bp.last_name) && (
                <div>
                  {bp.first_name} {bp.last_name}
                </div>
              )}
              {bp.nif_cif && (
                <div style={{ color: 'var(--text-secondary)' }}>NIF/CIF: {bp.nif_cif}</div>
              )}
              {bp.address_line1 && <div>{bp.address_line1}</div>}
              {bp.city && (
                <div>
                  {bp.postal_code} {bp.city}, {bp.country}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>
              Sin perfil de facturación — se factura a nombre del cliente
            </p>
          )}
        </Card>
        <Card>
          <h3 className={styles.sectionTitle}>Información de pago</h3>
          <div className={styles.infoRow}>
            <div>
              <span className={styles.infoLabel}>Proveedor:</span>{' '}
              {invoice.payment_provider || 'manual'}
            </div>
            <div>
              <span className={styles.infoLabel}>Método:</span>{' '}
              {invoice.payment_method || '—'}
            </div>
            <div>
              <span className={styles.infoLabel}>Referencia:</span>{' '}
              {invoice.payment_ref || '—'}
            </div>
            <div>
              <span className={styles.infoLabel}>Reintentos:</span>{' '}
              {invoice.retry_count}/{invoice.max_retries}
            </div>
          </div>
        </Card>
      </div>

      <Card className={styles.itemsWrapper}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              {['Concepto', 'Cant.', 'Precio unit.', 'Setup', 'Descuento', 'Total'].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className={styles.itemDesc}>{item.description}</div>
                  {item.period_start && item.period_end && (
                    <div className={styles.itemPeriod}>
                      {fmtDateLong(item.period_start)} — {fmtDateLong(item.period_end)}
                    </div>
                  )}
                </td>
                <td>{item.quantity}</td>
                <td>{fmtCurrency(item.unit_price, invoice.currency)}</td>
                <td>{fmtCurrency(item.setup_fee, invoice.currency)}</td>
                <td>{item.discount_pct ? `${item.discount_pct}%` : '—'}</td>
                <td className={styles.itemTotal}>
                  {fmtCurrency(item.total, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.totalsFooter}>
          <div className={styles.totalsInner}>
            <div className={styles.totalsRow}>
              <span>Subtotal</span>
              <span>{fmtCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {Number(invoice.discount_amount) > 0 && (
              <div className={styles.totalsRow}>
                <span>Descuento</span>
                <span>-{fmtCurrency(invoice.discount_amount, invoice.currency)}</span>
              </div>
            )}
            <div className={styles.totalsRow}>
              <span>IVA ({invoice.tax_rate}%)</span>
              <span>{fmtCurrency(invoice.tax_amount, invoice.currency)}</span>
            </div>
            <div className={styles.totalsFinal}>
              <span>TOTAL</span>
              <span>{fmtCurrency(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>
      </Card>

      {invoice.notes && (
        <Card>
          <h3 className={styles.sectionTitle}>Notas</h3>
          <p className={styles.notes}>{invoice.notes}</p>
        </Card>
      )}
    </DetailPage>
  );
}

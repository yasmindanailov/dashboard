/**
 * /dashboard/billing/[id] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. El backend filtra por ownership (CASL
 * Read.Invoice). Sin acciones admin: solo visualizacion + PDF.
 * ADR-078 Amendment A1.
 */

import Link from 'next/link';
import {
  Badge,
  Card,
  DetailPage,
  HelpTip,
} from '../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import {
  fmtCurrency,
  fmtDateLong,
  getInvoiceStatusInfo,
} from '../../../_shared/billing/invoice-status-map';
import styles from '../../../_shared/billing/invoiceDetail.module.css';
import DownloadPdfButton from './_components/DownloadPdfButton';

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
  is_manual: boolean;
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

export default async function ClientInvoiceDetailPage({ params }: PageProps) {
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
          href="/dashboard/billing"
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
        { label: 'Mis facturas', href: '/dashboard/billing' },
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
            </div>
            <div className={styles.headerMeta}>
              Emitida: {fmtDateLong(invoice.created_at)} · Vencimiento:{' '}
              {fmtDateLong(invoice.due_date)}
              <HelpTip text="Fecha límite de pago. Si tienes un método de pago registrado, se cobrará automáticamente antes de esta fecha." />
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
            <DownloadPdfButton
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoice_number}
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
          {bp ? (
            <div className={styles.infoBlock}>
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
              Sin perfil de facturación — se factura a tu nombre por defecto
            </p>
          )}
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

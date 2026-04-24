'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { billingApi } from '../../../lib/api';
import { DetailPage, Badge, Button, Card, HelpTip, useToast } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import styles from './invoiceDetail.module.css';

/* ═══════════════════════════════════════
   Invoice Detail Page (UI_SPEC §2.5)
   Layout: DetailPage (no tabs — single document)
   Ref: ROADMAP.md §7.5.D21
   ═══════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft:     { label: 'Borrador',     variant: 'neutral' },
  pending:   { label: 'Pendiente',    variant: 'warning' },
  paid:      { label: 'Pagada',       variant: 'success' },
  overdue:   { label: 'Vencida',      variant: 'danger' },
  cancelled: { label: 'Cancelada',    variant: 'neutral' },
  refunded:  { label: 'Reembolsada',  variant: 'info' },
};

interface InvoiceDetail {
  id: string; invoice_number: string; status: string;
  subtotal: string; tax_rate: string; tax_amount: string;
  discount_amount: string; total: string; currency: string;
  due_date: string; paid_at: string | null;
  payment_provider: string | null; payment_method: string | null;
  payment_ref: string | null; is_manual: boolean;
  retry_count: number; max_retries: number; notes: string | null;
  created_at: string;
  billing_profile?: { label: string; company_name?: string; first_name?: string; last_name?: string; nif_cif?: string; address_line1?: string; city?: string; postal_code?: string; country?: string; } | null;
  user?: { id: string; first_name: string; last_name: string; email: string; } | null;
  items: { id: string; description: string; quantity: number; unit_price: string; setup_fee: string; discount_pct: string | null; total: string; period_start: string | null; period_end: string | null; }[];
}

const fmt = (n: string | number, c = 'EUR') => new Intl.NumberFormat('es-ES', { style: 'currency', currency: c }).format(Number(n));
const fmtDate = (d: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;
  const { toast } = useToast();

  const loadInvoice = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try { setInvoice(await billingApi.getInvoice(token, id as string) as InvoiceDetail); }
    catch { /* */ }
    finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const handleAction = async (action: string) => {
    if (!token || !invoice) return;
    setActionLoading(true);
    try {
      if (action === 'finalize') await billingApi.finalizeInvoice(token, invoice.id);
      else if (action === 'pay') await billingApi.markAsPaid(token, invoice.id, {});
      else if (action === 'cancel') await billingApi.cancelInvoice(token, invoice.id);
      else if (action === 'refund') await billingApi.refundInvoice(token, invoice.id);
      const labels: Record<string, string> = { finalize: 'Factura enviada.', pay: 'Factura cobrada.', cancel: 'Factura cancelada.', refund: 'Factura reembolsada.' };
      toast('success', labels[action] || 'Acción completada.');
      loadInvoice();
    } catch {
      toast('error', 'No se pudo completar la acción.');
    }
    finally { setActionLoading(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, color: 'var(--text-tertiary)' }}>Cargando factura...</div>;
  if (!invoice) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Factura no encontrada. <Link href="/dashboard/billing" style={{ color: 'var(--brand)', textDecoration: 'none' }}>Volver</Link></div>;

  const st = STATUS_MAP[invoice.status] || STATUS_MAP.draft;
  const bp = invoice.billing_profile;

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Facturación', href: '/dashboard/billing' },
        { label: invoice.invoice_number },
      ]}
      wide
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)', margin: 0 }}>{invoice.invoice_number}</h1>
              <Badge variant={st.variant}>{st.label}</Badge>
              {invoice.is_manual && <Badge variant="neutral">Manual</Badge>}
            </div>
            <div className={styles.headerMeta}>
              Emitida: {fmtDate(invoice.created_at)} · Vencimiento: {fmtDate(invoice.due_date)}
              {!isAdmin && <HelpTip text="Fecha límite de pago. Si tienes un método de pago registrado, se cobrará automáticamente antes de esta fecha." />}
              {invoice.paid_at && <> · <span className={styles.headerMetaPaid}>Pagada: {fmtDate(invoice.paid_at)}</span></>}
            </div>
          </div>
          <div className={styles.actions}>
            {isAdmin && invoice.status === 'draft' && <Button onClick={() => handleAction('finalize')} disabled={actionLoading}>Enviar</Button>}
            {isAdmin && ['pending', 'overdue'].includes(invoice.status) && <Button onClick={() => handleAction('pay')} disabled={actionLoading}>Marcar pagada</Button>}
            {isAdmin && invoice.status === 'paid' && <Button variant="secondary" onClick={() => handleAction('refund')} disabled={actionLoading}>Reembolsar</Button>}
            {isAdmin && ['draft', 'pending'].includes(invoice.status) && <Button variant="danger" onClick={() => handleAction('cancel')} disabled={actionLoading}>Cancelar</Button>}
            <Button variant="secondary" onClick={() => billingApi.downloadPdf(token, invoice.id, invoice.invoice_number)}>PDF</Button>
          </div>
        </div>
      }
    >
      {/* Client + Payment info */}
      <div className={styles.grid}>
        <Card>
          <h3 className={styles.sectionTitle}>{bp?.nif_cif ? 'Factura completa' : 'Factura simplificada'}</h3>
          {invoice.user && (
            <div style={{ marginBottom: 'var(--space-2_5)', paddingBottom: 'var(--space-2_5)', borderBottom: '1px solid var(--border-light)' }}>
              <span className={styles.infoBlockLabel}>CLIENTE</span>
              <Link href={`/dashboard/clients/${invoice.user.id}`} style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--brand)', textDecoration: 'none' }}>
                {invoice.user.first_name} {invoice.user.last_name}
              </Link>
              <span style={{ color: 'var(--text-tertiary)', marginLeft: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>{invoice.user.email}</span>
            </div>
          )}
          {bp ? (
            <div className={styles.infoBlock}>
              <span className={styles.infoBlockLabel}>PERFIL DE FACTURACIÓN</span>
              {bp.company_name && <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{bp.company_name}</div>}
              {(bp.first_name || bp.last_name) && <div>{bp.first_name} {bp.last_name}</div>}
              {bp.nif_cif && <div style={{ color: 'var(--text-secondary)' }}>NIF/CIF: {bp.nif_cif}</div>}
              {bp.address_line1 && <div>{bp.address_line1}</div>}
              {bp.city && <div>{bp.postal_code} {bp.city}, {bp.country}</div>}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>Sin perfil de facturación — se factura a nombre del cliente</p>
          )}
        </Card>
        <Card>
          <h3 className={styles.sectionTitle}>Información de pago</h3>
          <div className={styles.infoRow}>
            <div><span className={styles.infoLabel}>Proveedor:</span> {invoice.payment_provider || 'manual'}</div>
            <div><span className={styles.infoLabel}>Método:</span> {invoice.payment_method || '—'}</div>
            <div><span className={styles.infoLabel}>Referencia:</span> {invoice.payment_ref || '—'}</div>
            <div><span className={styles.infoLabel}>Reintentos:</span> {invoice.retry_count}/{invoice.max_retries}</div>
          </div>
        </Card>
      </div>

      {/* Items table */}
      <Card className={styles.itemsWrapper}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              {['Concepto', 'Cant.', 'Precio unit.', 'Setup', 'Descuento', 'Total'].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(item => (
              <tr key={item.id}>
                <td>
                  <div className={styles.itemDesc}>{item.description}</div>
                  {item.period_start && item.period_end && <div className={styles.itemPeriod}>{fmtDate(item.period_start)} — {fmtDate(item.period_end)}</div>}
                </td>
                <td>{item.quantity}</td>
                <td>{fmt(item.unit_price, invoice.currency)}</td>
                <td>{fmt(item.setup_fee, invoice.currency)}</td>
                <td>{item.discount_pct ? `${item.discount_pct}%` : '—'}</td>
                <td className={styles.itemTotal}>{fmt(item.total, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.totalsFooter}>
          <div className={styles.totalsInner}>
            <div className={styles.totalsRow}><span>Subtotal</span><span>{fmt(invoice.subtotal, invoice.currency)}</span></div>
            {Number(invoice.discount_amount) > 0 && <div className={styles.totalsRow}><span>Descuento</span><span>-{fmt(invoice.discount_amount, invoice.currency)}</span></div>}
            <div className={styles.totalsRow}><span>IVA ({invoice.tax_rate}%)</span><span>{fmt(invoice.tax_amount, invoice.currency)}</span></div>
            <div className={styles.totalsFinal}><span>TOTAL</span><span>{fmt(invoice.total, invoice.currency)}</span></div>
          </div>
        </div>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <h3 className={styles.sectionTitle}>Notas</h3>
          <p className={styles.notes}>{invoice.notes}</p>
        </Card>
      )}
    </DetailPage>
  );
}

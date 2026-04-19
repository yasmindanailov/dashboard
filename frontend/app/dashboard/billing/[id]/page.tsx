'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { billingApi } from '../../../lib/api';

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(156, 163, 175, 0.15)', color: '#6b7280', label: 'Borrador' },
  pending: { bg: 'rgba(245, 158, 11, 0.15)', color: '#d97706', label: 'Pendiente' },
  paid: { bg: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', label: 'Pagada' },
  overdue: { bg: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', label: 'Vencida' },
  cancelled: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'Cancelada' },
  refunded: { bg: 'rgba(139, 92, 246, 0.15)', color: '#7c3aed', label: 'Reembolsada' },
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual', quarterly: 'Trimestral', semiannual: 'Semestral',
  annual: 'Anual', one_time: 'Único',
};

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

  const loadInvoice = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const res = await billingApi.getInvoice(token, id as string) as InvoiceDetail;
      setInvoice(res);
    } catch (e) { console.error(e); }
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
      loadInvoice();
    } catch (e) { console.error(e); }
    finally { setActionLoading(false); }
  };

  const fmt = (amount: string | number, currency = 'EUR') =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));

  const fmtDate = (date: string) =>
    new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(date));

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, color: '#9ca3af' }}>
      Cargando factura...
    </div>
  );

  if (!invoice) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
      Factura no encontrada. <Link href="/dashboard/billing" style={{ color: '#635BFF' }}>Volver</Link>
    </div>
  );

  const st = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;
  const bp = invoice.billing_profile;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20, fontSize: 13, color: '#9ca3af' }}>
        <Link href="/dashboard/billing" style={{ color: '#635BFF', textDecoration: 'none' }}>← Facturación</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>{invoice.invoice_number}</span>
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, padding: 24, background: '#fff', borderRadius: 14,
        border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>{invoice.invoice_number}</h1>
            <span style={{
              padding: '4px 12px', borderRadius: 20, background: st.bg,
              color: st.color, fontSize: 13, fontWeight: 600,
            }}>{st.label}</span>
            {invoice.is_manual && (
              <span style={{ padding: '4px 10px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280', fontSize: 11 }}>Manual</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>
            Emitida: {fmtDate(invoice.created_at)} · Vencimiento: {fmtDate(invoice.due_date)}
            {invoice.paid_at && <> · <span style={{ color: '#16a34a', fontWeight: 500 }}>Pagada: {fmtDate(invoice.paid_at)}</span></>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && invoice.status === 'draft' && (
            <button onClick={() => handleAction('finalize')} disabled={actionLoading}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#635BFF', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: actionLoading ? 0.7 : 1 }}>
              Enviar
            </button>
          )}
          {isAdmin && ['pending', 'overdue'].includes(invoice.status) && (
            <button onClick={() => handleAction('pay')} disabled={actionLoading}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: actionLoading ? 0.7 : 1 }}>
              Marcar pagada
            </button>
          )}
          {isAdmin && invoice.status === 'paid' && (
            <button onClick={() => handleAction('refund')} disabled={actionLoading}
              style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #7c3aed', background: 'rgba(139,92,246,0.05)', color: '#7c3aed', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Reembolsar
            </button>
          )}
          {isAdmin && ['draft', 'pending'].includes(invoice.status) && (
            <button onClick={() => handleAction('cancel')} disabled={actionLoading}
              style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Cancelar
            </button>
          )}
          <button onClick={() => billingApi.downloadPdf(token, invoice.id, invoice.invoice_number)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', color: '#374151', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            📥 PDF
          </button>
        </div>
      </div>

      {/* Two columns: client info + payment info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Client info */}
        <div style={{
          padding: 20, background: '#fff', borderRadius: 14,
          border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {bp?.nif_cif ? 'Factura completa' : 'Factura simplificada'}
          </h3>
          {/* Always show the linked user */}
          {invoice.user && (
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 3 }}>CLIENTE</span>
              <Link href={`/dashboard/clients/${invoice.user.id}`}
                style={{ fontWeight: 600, color: '#635BFF', textDecoration: 'none', borderBottom: '1px dashed rgba(99,91,255,0.3)', paddingBottom: 1, transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = '#635BFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(99,91,255,0.3)'; }}>
                {invoice.user.first_name} {invoice.user.last_name}
              </Link>
              <span style={{ color: '#9ca3af', marginLeft: 8 }}>{invoice.user.email}</span>
            </div>
          )}
          {bp ? (
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              <span style={{ color: '#9ca3af', fontSize: 12, display: 'block', marginBottom: 3 }}>PERFIL DE FACTURACIÓN</span>
              {bp.company_name && <div style={{ fontWeight: 600 }}>{bp.company_name}</div>}
              {(bp.first_name || bp.last_name) && <div>{bp.first_name} {bp.last_name}</div>}
              {bp.nif_cif && <div style={{ color: '#6b7280' }}>NIF/CIF: {bp.nif_cif}</div>}
              {bp.address_line1 && <div>{bp.address_line1}</div>}
              {bp.city && <div>{bp.postal_code} {bp.city}, {bp.country}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>
              Sin perfil de facturación — se factura a nombre del cliente
            </div>
          )}
        </div>

        {/* Payment info */}
        <div style={{
          padding: 20, background: '#fff', borderRadius: 14,
          border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Información de pago
          </h3>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.8 }}>
            <div><span style={{ color: '#9ca3af' }}>Proveedor:</span> {invoice.payment_provider || 'manual'}</div>
            <div><span style={{ color: '#9ca3af' }}>Método:</span> {invoice.payment_method || '—'}</div>
            <div><span style={{ color: '#9ca3af' }}>Referencia:</span> {invoice.payment_ref || '—'}</div>
            <div><span style={{ color: '#9ca3af' }}>Reintentos:</span> {invoice.retry_count}/{invoice.max_retries}</div>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: 24,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['Concepto', 'Cant.', 'Precio unit.', 'Setup', 'Descuento', 'Total'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontWeight: 500, color: '#111827' }}>{item.description}</div>
                  {item.period_start && item.period_end && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      {fmtDate(item.period_start)} — {fmtDate(item.period_end)}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 16px', color: '#374151' }}>{item.quantity}</td>
                <td style={{ padding: '14px 16px', color: '#374151' }}>{fmt(item.unit_price, invoice.currency)}</td>
                <td style={{ padding: '14px 16px', color: '#374151' }}>{fmt(item.setup_fee, invoice.currency)}</td>
                <td style={{ padding: '14px 16px', color: '#374151' }}>{item.discount_pct ? `${item.discount_pct}%` : '—'}</td>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111827' }}>{fmt(item.total, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ padding: '16px 16px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <div style={{ maxWidth: 300, marginLeft: 'auto' }}>
            {[
              { label: 'Subtotal', value: fmt(invoice.subtotal, invoice.currency) },
              ...(Number(invoice.discount_amount) > 0 ? [{ label: 'Descuento', value: `-${fmt(invoice.discount_amount, invoice.currency)}` }] : []),
              { label: `IVA (${invoice.tax_rate}%)`, value: fmt(invoice.tax_amount, invoice.currency) },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: '#6b7280' }}>
                <span>{row.label}</span><span>{row.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #374151', fontSize: 18, fontWeight: 700, color: '#111827' }}>
              <span>TOTAL</span><span>{fmt(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div style={{
          padding: 20, background: '#fff', borderRadius: 14,
          border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Notas</h3>
          <p style={{ color: '#374151', margin: 0, whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}

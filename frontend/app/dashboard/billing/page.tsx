'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { billingApi } from '../../lib/api';

/* ═══════════════════════════════════════
   Status badges
   ═══════════════════════════════════════ */
const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(156, 163, 175, 0.1)', color: '#6b7280', label: 'Borrador' },
  pending: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', label: 'Pendiente' },
  paid: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Pagada' },
  overdue: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Vencida' },
  cancelled: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', label: 'Cancelada' },
  refunded: { bg: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed', label: 'Reembolsada' },
};

interface InvoiceItem {
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
  is_manual: boolean;
  retry_count: number;
  max_retries: number;
  created_at: string;
  billing_profile?: { label: string; nif_cif?: string } | null;
  items: { description: string }[];
}

interface InvoiceStats {
  total_invoices: number;
  total_revenue: number;
  pending_amount: number;
  overdue_count: number;
}

interface PaginatedResponse {
  data: InvoiceItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const filterUserId = searchParams.get('userId') || '';

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;

  const loadInvoices = useCallback(async (page = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await billingApi.listInvoices(token, {
        page,
        limit: 20,
        search: search || undefined,
        status: filterStatus || undefined,
        user_id: filterUserId || undefined,
      }) as PaginatedResponse;
      setInvoices(res.data);
      setMeta(res.meta);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, search, filterStatus, filterUserId]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await billingApi.getStats(token) as InvoiceStats;
      setStats(res);
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => { loadInvoices(); loadStats(); }, [loadInvoices, loadStats]);

  const handleAction = async (id: string, action: 'finalize' | 'pay' | 'cancel') => {
    if (!token) return;
    setActionLoading(id);
    try {
      if (action === 'finalize') await billingApi.finalizeInvoice(token, id);
      else if (action === 'pay') await billingApi.markAsPaid(token, id, {});
      else if (action === 'cancel') await billingApi.cancelInvoice(token, id);
      loadInvoices(meta.page);
      loadStats();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount: string, currency: string) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0 }}>Facturación</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0' }}>Gestión de facturas y cobros</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/dashboard/billing/checkout" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', background: '#635BFF', color: '#fff',
            borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 14,
            transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(99,91,255,0.3)',
          }}>
            + Contratar servicio
          </Link>
        </div>
      </div>

      {/* Filter banner when viewing a specific client's invoices */}
      {filterUserId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: 'rgba(99,91,255,0.06)', border: '1px solid rgba(99,91,255,0.15)',
          borderRadius: 10, marginBottom: 16, fontSize: 13,
        }}>
          <span style={{ color: '#4c46b8' }}>
            🔍 Mostrando facturas de un cliente específico
          </span>
          <Link href="/dashboard/billing" style={{
            color: '#635BFF', fontWeight: 600, textDecoration: 'none', fontSize: 12,
          }}>
            ✕ Ver todas
          </Link>
        </div>
      )}
      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total facturas', value: stats.total_invoices, icon: '📄' },
            { label: 'Ingresos', value: formatCurrency(String(stats.total_revenue), 'EUR'), icon: '💰' },
            { label: 'Pendiente cobro', value: formatCurrency(String(stats.pending_amount), 'EUR'), icon: '⏳' },
            { label: 'Vencidas', value: stats.overdue_count, icon: '🔴', warn: stats.overdue_count > 0 },
          ].map((s, i) => (
            <div key={i} style={{
              padding: 20, borderRadius: 14,
              background: s.warn ? 'rgba(239, 68, 68, 0.04)' : '#fff',
              border: s.warn ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid #f0f0f0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#dc2626' : '#111827' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Buscar factura..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '10px 16px', border: '1px solid #e5e7eb',
            borderRadius: 10, fontSize: 14, outline: 'none',
            transition: 'border 0.2s',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#635BFF')}
          onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '10px 16px', border: '1px solid #e5e7eb',
            borderRadius: 10, fontSize: 14, background: '#fff', cursor: 'pointer',
          }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_STYLES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['Nº Factura', 'Estado', 'Cliente', 'Total', 'Fecha emisión', 'Vencimiento', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No hay facturas</td></tr>
            ) : invoices.map((inv) => {
              const st = STATUS_STYLES[inv.status] || STATUS_STYLES.draft;
              return (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbff')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '14px 16px' }}>
                    <Link href={`/dashboard/billing/${inv.id}`} style={{ color: '#635BFF', fontWeight: 600, textDecoration: 'none' }}>
                      {inv.invoice_number}
                    </Link>
                    {inv.is_manual && <span style={{ marginLeft: 6, fontSize: 10, color: '#9ca3af' }}>Manual</span>}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: 20,
                      background: st.bg, color: st.color, fontSize: 12, fontWeight: 600,
                    }}>{st.label}</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#374151' }}>
                    {inv.billing_profile?.label || '—'}
                    {inv.billing_profile?.nif_cif && <span style={{ display: 'block', fontSize: 11, color: '#9ca3af' }}>{inv.billing_profile.nif_cif}</span>}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111827' }}>
                    {formatCurrency(inv.total, inv.currency)}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#6b7280' }}>{formatDate(inv.created_at)}</td>
                  <td style={{ padding: '14px 16px', color: inv.status === 'overdue' ? '#dc2626' : '#6b7280' }}>
                    {formatDate(inv.due_date)}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isAdmin && inv.status === 'draft' && (
                        <button onClick={() => handleAction(inv.id, 'finalize')} disabled={actionLoading === inv.id}
                          style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #635BFF', background: 'rgba(99,91,255,0.05)', color: '#635BFF', cursor: 'pointer', fontWeight: 500 }}>
                          Enviar
                        </button>
                      )}
                      {isAdmin && ['pending', 'overdue'].includes(inv.status) && (
                        <button onClick={() => handleAction(inv.id, 'pay')} disabled={actionLoading === inv.id}
                          style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #16a34a', background: 'rgba(34,197,94,0.05)', color: '#16a34a', cursor: 'pointer', fontWeight: 500 }}>
                          Cobrar
                        </button>
                      )}
                      {isAdmin && ['draft', 'pending'].includes(inv.status) && (
                        <button onClick={() => handleAction(inv.id, 'cancel')} disabled={actionLoading === inv.id}
                          style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontWeight: 500 }}>
                          Cancelar
                        </button>
                      )}
                      <button onClick={() => billingApi.downloadPdf(token, inv.id, inv.invoice_number)}
                        style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fafafa', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => loadInvoices(p)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: p === meta.page ? '#635BFF' : '#f3f4f6',
                color: p === meta.page ? '#fff' : '#374151',
                fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
              }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

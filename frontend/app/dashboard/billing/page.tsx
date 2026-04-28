'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { billingApi } from '../../lib/api';
import {
  Table, Badge, SearchInput, Pagination,
  Button, AlertBanner, HelpTip, useToast, BulkActionBar, Modal,
  ListPage, FilterBar, StatusTabs,
} from '../../components/ui';
import type { TableColumn, BadgeVariant, StatusTab } from '../../components/ui';
import s from '../../_shared/billing/billing.module.css';

/* ═══════════════════════════════════════
   Billing Page — List (UI_SPEC §2.4)
   Layout: ListPage + StatusTabs + FilterBar
   StatsCards removed (§3.1: only in Overview).
   Ref: ROADMAP.md §7.5.D20, UI_SPEC §5.4
   ═══════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft:     { label: 'Borrador',    variant: 'neutral' },
  pending:   { label: 'Pendiente',   variant: 'warning' },
  paid:      { label: 'Pagada',      variant: 'success' },
  overdue:   { label: 'Vencida',     variant: 'danger' },
  cancelled: { label: 'Cancelada',   variant: 'neutral' },
  refunded:  { label: 'Reembolsada', variant: 'info' },
};

interface InvoiceItem {
  id: string; invoice_number: string; status: string;
  subtotal: string; tax_rate: string; tax_amount: string;
  discount_amount: string; total: string; currency: string;
  due_date: string; paid_at: string | null; payment_provider: string | null;
  is_manual: boolean; retry_count: number; max_retries: number; created_at: string;
  billing_profile?: { label: string; nif_cif?: string } | null;
  user?: { id: string; first_name: string; last_name: string; email: string } | null;
  items: { description: string }[];
}

interface InvoiceStats {
  total_invoices: number; total_revenue: number; pending_amount: number;
  overdue_count: number; draft_count: number; pending_count: number;
  paid_count: number; cancelled_count: number; refunded_count: number;
}
interface PaginatedResponse { data: InvoiceItem[]; meta: { total: number; page: number; limit: number; totalPages: number }; }

const fmt = (amount: string | number, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));
const fmtDate = (date: string) =>
  new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));

export default function InvoicesPage() {
  const router = useRouter();
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
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pay' | 'cancel' | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;
  const { toast } = useToast();

  const loadInvoices = useCallback(async (page = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await billingApi.listInvoices(token, {
        page, limit: 20, search: search || undefined,
        status: filterStatus || undefined, user_id: filterUserId || undefined,
      }) as PaginatedResponse;
      setInvoices(res.data); setMeta(res.meta);
    } catch (err) { console.warn('[Billing] loadInvoices failed:', err); }
    finally { setLoading(false); }
  }, [token, search, filterStatus, filterUserId]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try { setStats(await billingApi.getStats(token) as InvoiceStats); } catch (err) { console.warn('[Billing] loadStats failed:', err); }
  }, [token]);

  useEffect(() => { loadInvoices(); loadStats(); }, [loadInvoices, loadStats]);

  const handleAction = async (id: string, action: 'finalize' | 'pay' | 'cancel') => {
    if (!token) return;
    setActionLoading(id);
    try {
      if (action === 'finalize') await billingApi.finalizeInvoice(token, id);
      else if (action === 'pay') await billingApi.markAsPaid(token, id, {});
      else if (action === 'cancel') await billingApi.cancelInvoice(token, id);
      const labels = { finalize: 'Factura enviada.', pay: 'Factura cobrada.', cancel: 'Factura cancelada.' };
      toast('success', labels[action]);
      loadInvoices(meta.page); loadStats();
    } catch {
      toast('error', 'No se pudo completar la acción.');
    }
    finally { setActionLoading(null); }
  };

  /* ── Bulk actions (§4.11) ── */
  const executeBulk = async (action: 'pay' | 'cancel') => {
    if (!token || selected.size === 0) return;
    setBulkLoading(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try {
        if (action === 'pay') await billingApi.markAsPaid(token, String(id), {});
        else await billingApi.cancelInvoice(token, String(id));
        ok++;
      } catch { fail++; }
    }
    const label = action === 'pay' ? 'cobradas' : 'canceladas';
    if (ok > 0) toast('success', `${ok} factura${ok > 1 ? 's' : ''} ${label}.`);
    if (fail > 0) toast('error', `${fail} factura${fail > 1 ? 's' : ''} fallaron.`);
    setSelected(new Set());
    setBulkAction(null);
    setBulkLoading(false);
    loadInvoices(meta.page);
    loadStats();
  };

  const handleBulkPdf = () => {
    for (const id of selected) {
      const inv = invoices.find((i) => i.id === String(id));
      if (inv) billingApi.downloadPdf(token, inv.id, inv.invoice_number);
    }
    toast('info', `Descargando ${selected.size} PDF...`);
  };

  /* ── StatusTabs with per-status counts (§3.2, P6.1) ── */
  const statusTabs: StatusTab[] = [
    { label: 'Todas', value: '', count: stats?.total_invoices },
    { label: 'Pendientes', value: 'pending', count: stats?.pending_count, variant: 'warning' },
    { label: 'Pagadas', value: 'paid', count: stats?.paid_count, variant: 'success' },
    { label: 'Vencidas', value: 'overdue', count: stats?.overdue_count, variant: 'danger' },
    ...(isAdmin ? [{ label: 'Canceladas', value: 'cancelled', count: stats?.cancelled_count }] : []),
  ];

  /* ── Icons ── */
  const IconInvoice = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

  /* ── Column definitions ── */
  const columns: TableColumn<InvoiceItem>[] = [
    {
      key: 'invoice_number', header: 'Nº Factura',
      render: (inv) => (
        <div>
          <Link href={`/dashboard/billing/${inv.id}`} className={s.invoiceLink}>
            {inv.invoice_number}
          </Link>
          {inv.is_manual && <span className={s.manualTag}>Manual</span>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Estado', width: '120px',
      render: (inv) => { const s = STATUS_MAP[inv.status] || STATUS_MAP.draft; return <Badge variant={s.variant}>{s.label}</Badge>; },
    },
    /* P6.1: Hide 'Cliente' column for non-admin (redundant — they only see their own invoices) */
    ...(isAdmin ? [{
      key: 'client', header: 'Cliente',
      render: (inv: InvoiceItem) => {
        const clientName = inv.user
          ? `${inv.user.first_name} ${inv.user.last_name}`
          : null;
        return (
          <div>
            <span className={s.clientName}>{clientName || inv.billing_profile?.label || '—'}</span>
            {inv.billing_profile?.nif_cif && <span className={s.clientNif}>{inv.billing_profile.nif_cif}</span>}
          </div>
        );
      },
    } as TableColumn<InvoiceItem>] : []),
    {
      key: 'total', header: 'Total', width: '120px',
      render: (inv) => <span className={s.totalAmount}>{fmt(inv.total, inv.currency)}</span>,
    },
    { key: 'created_at', header: 'Emisión', render: (inv) => <span className={s.dateCell}>{fmtDate(inv.created_at)}</span> },
    {
      key: 'due_date', header: <>{!isAdmin ? <>Vencimiento <HelpTip text="Fecha límite de pago. Se cobra automáticamente si tienes un método registrado." /></> : 'Vencimiento'}</>,
      render: (inv) => <span className={inv.status === 'overdue' ? s.dateOverdue : s.dateCell}>{fmtDate(inv.due_date)}</span>,
    },
    {
      key: 'actions', header: '', width: '180px', align: 'right',
      render: (inv) => (
        <div className={s.actions}>
          {isAdmin && inv.status === 'draft' && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleAction(inv.id, 'finalize'); }} disabled={actionLoading === inv.id}>Enviar</Button>
          )}
          {isAdmin && ['pending', 'overdue'].includes(inv.status) && (
            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); handleAction(inv.id, 'pay'); }} disabled={actionLoading === inv.id}>Cobrar</Button>
          )}
          {isAdmin && ['draft', 'pending'].includes(inv.status) && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleAction(inv.id, 'cancel'); }} disabled={actionLoading === inv.id}>Cancelar</Button>
          )}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); billingApi.downloadPdf(token, inv.id, inv.invoice_number); }}>PDF</Button>
        </div>
      ),
    },
  ];

  return (
    <ListPage
      title="Facturación"
      subtitle={isAdmin ? 'Gestión de facturas y cobros' : 'Mis facturas y servicios'}
      action={
        <Link href="/dashboard/billing/checkout">
          <Button>{isAdmin ? 'Crear servicio para cliente' : 'Contratar servicio'}</Button>
        </Link>
      }
      banner={
        filterUserId ? (
          <div className={s.bannerWrap}>
            <AlertBanner variant="info" onClose={() => router.push('/dashboard/billing')}>
              Mostrando facturas de un cliente específico
            </AlertBanner>
          </div>
        ) : undefined
      }
      statusTabs={
        <StatusTabs tabs={statusTabs} active={filterStatus} onChange={setFilterStatus} />
      }
      filterBar={
        <FilterBar
          search={
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="Buscar factura..." />
          }
        />
      }
      pagination={
        <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={(p) => loadInvoices(p)} />
      }
    >
      <Table<InvoiceItem>
        columns={columns} data={invoices} rowKey={(inv) => inv.id}
        loading={loading} skeletonRows={6}
        onRowClick={(inv) => router.push(`/dashboard/billing/${inv.id}`)}
        emptyIcon={IconInvoice} emptyTitle="Sin facturas"
        emptyDescription="No hay facturas que coincidan con los filtros"
        selectable={isAdmin}
        selectedIds={selected}
        onSelectionChange={setSelected}
      />

      {/* Bulk action bar (§4.11) */}
      {isAdmin && selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button size="sm" onClick={() => setBulkAction('pay')}>Cobrar seleccionadas</Button>
          <Button size="sm" variant="secondary" onClick={handleBulkPdf}>Descargar PDF</Button>
          <Button size="sm" variant="danger" onClick={() => setBulkAction('cancel')}>Cancelar</Button>
        </BulkActionBar>
      )}

      {/* Bulk confirmation modal (§4.2) */}
      <Modal
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        title={bulkAction === 'pay' ? 'Cobrar facturas en lote' : 'Cancelar facturas en lote'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkAction(null)}>Cancelar</Button>
            <Button
              variant={bulkAction === 'cancel' ? 'danger' : 'primary'}
              loading={bulkLoading}
              onClick={() => bulkAction && executeBulk(bulkAction)}
            >
              {bulkAction === 'pay' ? `Cobrar ${selected.size}` : `Cancelar ${selected.size}`}
            </Button>
          </>
        }
      >
        <p className={s.bulkConfirmText}>
          {bulkAction === 'pay'
            ? `¿Marcar ${selected.size} factura${selected.size > 1 ? 's' : ''} como pagada${selected.size > 1 ? 's' : ''}?`
            : `¿Cancelar ${selected.size} factura${selected.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`
          }
        </p>
      </Modal>
    </ListPage>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { billingApi } from '../../lib/api';
import {
  Table, Badge, SearchInput, Pagination, Button, HelpTip,
  ListPage, FilterBar, StatusTabs,
} from '../../components/ui';
import type { TableColumn, StatusTab } from '../../components/ui';
import {
  getInvoiceStatusInfo,
  fmtCurrency,
  fmtDateShort,
} from '../../_shared/billing/invoice-status-map';
import s from '../../_shared/billing/billing.module.css';

/* ═══════════════════════════════════════
   Client Billing — Portal de Cliente (ADR-066 Fase E.2)
   UX simplificada: sin columna "Cliente" (el cliente sólo ve sus
   propias facturas — el backend filtra `user_id` server-side), sin
   tab "Canceladas" (estado interno administrativo), sin botones de
   cobro/cancel/refund, sin bulk operations, sin selectable.
   El cliente solo ve y descarga sus facturas; el cobro automático
   se gestiona por el backend cuando hay método de pago registrado.
   Audiencia: rol `client` (CASL `Read.Invoice` con ownership filter).
   El staff tiene `/admin/billing` (full UX gestión).
   Ref: UI_SPEC §2.4, ADR-066, ADR-067
   ═══════════════════════════════════════ */

interface InvoiceItem {
  id: string; invoice_number: string; status: string;
  total: string; currency: string;
  due_date: string; paid_at: string | null;
  is_manual: boolean; created_at: string;
  items: { description: string }[];
}

interface InvoiceStats {
  total_invoices: number; pending_amount: number;
  pending_count: number; paid_count: number; overdue_count: number;
}
interface PaginatedResponse {
  data: InvoiceItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function ClientInvoicesPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const loadInvoices = useCallback(async (page = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await billingApi.listInvoices(token, {
        page, limit: 20,
        search: search || undefined,
        status: filterStatus || undefined,
      }) as PaginatedResponse;
      setInvoices(res.data); setMeta(res.meta);
    } catch (err) { console.warn('[ClientBilling] loadInvoices failed:', err); }
    finally { setLoading(false); }
  }, [token, search, filterStatus]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try { setStats(await billingApi.getStats(token) as InvoiceStats); }
    catch (err) { console.warn('[ClientBilling] loadStats failed:', err); }
  }, [token]);

  useEffect(() => { loadInvoices(); loadStats(); }, [loadInvoices, loadStats]);

  /* ── StatusTabs simplificadas (cliente NO ve "Canceladas") ── */
  const statusTabs: StatusTab[] = [
    { label: 'Todas', value: '', count: stats?.total_invoices },
    { label: 'Pendientes', value: 'pending', count: stats?.pending_count, variant: 'warning' },
    { label: 'Pagadas', value: 'paid', count: stats?.paid_count, variant: 'success' },
    { label: 'Vencidas', value: 'overdue', count: stats?.overdue_count, variant: 'danger' },
  ];

  const IconInvoice = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );

  /* ── Columnas: sin "Cliente" (redundante), sin acciones admin ── */
  const columns: TableColumn<InvoiceItem>[] = [
    {
      key: 'invoice_number', header: 'Nº Factura',
      render: (inv) => (
        <Link href={`/dashboard/billing/${inv.id}`} className={s.invoiceLink}>
          {inv.invoice_number}
        </Link>
      ),
    },
    {
      key: 'status', header: 'Estado', width: '120px',
      render: (inv) => {
        const info = getInvoiceStatusInfo(inv.status);
        return <Badge variant={info.variant}>{info.label}</Badge>;
      },
    },
    {
      key: 'total', header: 'Total', width: '120px',
      render: (inv) => <span className={s.totalAmount}>{fmtCurrency(inv.total, inv.currency)}</span>,
    },
    {
      key: 'created_at', header: 'Emisión',
      render: (inv) => <span className={s.dateCell}>{fmtDateShort(inv.created_at)}</span>,
    },
    {
      key: 'due_date',
      header: (
        <>
          Vencimiento <HelpTip text="Fecha límite de pago. Se cobra automáticamente si tienes un método registrado." />
        </>
      ),
      render: (inv) => (
        <span className={inv.status === 'overdue' ? s.dateOverdue : s.dateCell}>
          {fmtDateShort(inv.due_date)}
        </span>
      ),
    },
    {
      key: 'actions', header: '', width: '80px', align: 'right',
      render: (inv) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); billingApi.downloadPdf(token, inv.id, inv.invoice_number); }}
        >
          PDF
        </Button>
      ),
    },
  ];

  return (
    <ListPage
      title="Mis facturas"
      subtitle="Tus facturas y servicios contratados"
      action={
        <Link href="/dashboard/billing/checkout">
          <Button>Contratar servicio</Button>
        </Link>
      }
      statusTabs={
        <StatusTabs tabs={statusTabs} active={filterStatus} onChange={setFilterStatus} />
      }
      filterBar={
        <FilterBar
          search={
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              placeholder="Buscar factura..."
            />
          }
        />
      }
      pagination={
        <Pagination
          page={meta.page} totalPages={meta.totalPages}
          total={meta.total} limit={meta.limit}
          onPageChange={(p) => loadInvoices(p)}
        />
      }
    >
      <Table<InvoiceItem>
        columns={columns} data={invoices} rowKey={(inv) => inv.id}
        loading={loading} skeletonRows={6}
        onRowClick={(inv) => router.push(`/dashboard/billing/${inv.id}`)}
        emptyIcon={IconInvoice} emptyTitle="Sin facturas"
        emptyDescription="No tienes facturas todavía. Contrata un servicio para empezar."
      />
    </ListPage>
  );
}

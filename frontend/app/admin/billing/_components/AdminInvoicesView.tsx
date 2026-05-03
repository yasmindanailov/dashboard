'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertBanner,
  Badge,
  BulkActionBar,
  Button,
  FilterBar,
  Modal,
  Pagination,
  SearchInput,
  StatusTabs,
  Table,
  useToast,
} from '../../../components/ui';
import type { StatusTab, TableColumn } from '../../../components/ui';
import {
  fmtCurrency,
  fmtDateShort,
  getInvoiceStatusInfo,
} from '../../../_shared/billing/invoice-status-map';
import s from '../../../_shared/billing/billing.module.css';
import {
  cancelInvoiceAction,
  downloadInvoicePdfAction,
  finalizeInvoiceAction,
  payInvoiceAction,
} from '../_actions';

/* ═══════════════════════════════════════
   AdminInvoicesView — Sprint 13 §13.AUTH Fase E (Modelo A).
   Recibe data prehidratada por SC. Filtros + paginación via
   searchParams. Mutaciones individuales via Server Actions.
   Bulk actions iteran Server Actions secuencialmente.
   ═══════════════════════════════════════ */

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
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  items: { description: string }[];
}

interface InvoiceStats {
  total_invoices: number;
  total_revenue: number;
  pending_amount: number;
  overdue_count: number;
  draft_count: number;
  pending_count: number;
  paid_count: number;
  cancelled_count: number;
  refunded_count: number;
}

interface Props {
  invoices: InvoiceItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  stats: InvoiceStats | null;
  initialFilters: { search: string; status: string; userId: string };
}

const IconInvoice = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export default function AdminInvoicesView({
  invoices,
  meta,
  stats,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const [search, setSearch] = useState(initialFilters.search);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pay' | 'cancel' | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  function pushFilters(next: { search?: string; status?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const writeOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    };
    if (next.search !== undefined) writeOrDelete('search', next.search);
    if (next.status !== undefined) writeOrDelete('status', next.status);
    params.delete('page');
    startTransition(() => router.push(`/admin/billing?${params.toString()}`));
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`/admin/billing?${params.toString()}`));
  }

  async function handleSingleAction(
    id: string,
    action: 'finalize' | 'pay' | 'cancel',
  ) {
    setActionLoading(id);
    const fn =
      action === 'finalize'
        ? finalizeInvoiceAction
        : action === 'pay'
          ? payInvoiceAction
          : cancelInvoiceAction;
    const labels = {
      finalize: 'Factura enviada.',
      pay: 'Factura cobrada.',
      cancel: 'Factura cancelada.',
    };
    const result = await fn(id);
    if (result.ok) {
      toast('success', labels[action]);
    } else {
      toast('error', result.error);
    }
    setActionLoading(null);
  }

  async function handleDownloadPdf(id: string, invoiceNumber: string) {
    const result = await downloadInvoicePdfAction(id);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `${invoiceNumber}.pdf`;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function executeBulk(action: 'pay' | 'cancel') {
    if (selected.size === 0) return;
    setBulkLoading(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      const fn = action === 'pay' ? payInvoiceAction : cancelInvoiceAction;
      const result = await fn(String(id));
      if (result.ok) ok++;
      else fail++;
    }
    const label = action === 'pay' ? 'cobradas' : 'canceladas';
    if (ok > 0) toast('success', `${ok} factura${ok > 1 ? 's' : ''} ${label}.`);
    if (fail > 0) toast('error', `${fail} factura${fail > 1 ? 's' : ''} fallaron.`);
    setSelected(new Set());
    setBulkAction(null);
    setBulkLoading(false);
  }

  function handleBulkPdf() {
    void Promise.all(
      Array.from(selected).map(async (id) => {
        const inv = invoices.find((i) => i.id === String(id));
        if (inv) await handleDownloadPdf(inv.id, inv.invoice_number);
      }),
    );
    toast('info', `Descargando ${selected.size} PDF...`);
  }

  const statusTabs: StatusTab[] = [
    { label: 'Todas', value: '', count: stats?.total_invoices },
    { label: 'Pendientes', value: 'pending', count: stats?.pending_count, variant: 'warning' },
    { label: 'Pagadas', value: 'paid', count: stats?.paid_count, variant: 'success' },
    { label: 'Vencidas', value: 'overdue', count: stats?.overdue_count, variant: 'danger' },
    { label: 'Canceladas', value: 'cancelled', count: stats?.cancelled_count },
  ];

  const columns: TableColumn<InvoiceItem>[] = [
    {
      key: 'invoice_number',
      header: 'Nº Factura',
      render: (inv) => (
        <div>
          <Link href={`/admin/billing/${inv.id}`} className={s.invoiceLink}>
            {inv.invoice_number}
          </Link>
          {inv.is_manual && <span className={s.manualTag}>Manual</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      width: '120px',
      render: (inv) => {
        const info = getInvoiceStatusInfo(inv.status);
        return <Badge variant={info.variant}>{info.label}</Badge>;
      },
    },
    {
      key: 'client',
      header: 'Cliente',
      render: (inv) => {
        const clientName = inv.user
          ? `${inv.user.first_name} ${inv.user.last_name}`
          : null;
        return (
          <div>
            <span className={s.clientName}>
              {clientName || inv.billing_profile?.label || '—'}
            </span>
            {inv.billing_profile?.nif_cif && (
              <span className={s.clientNif}>{inv.billing_profile.nif_cif}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      width: '120px',
      render: (inv) => (
        <span className={s.totalAmount}>{fmtCurrency(inv.total, inv.currency)}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Emisión',
      render: (inv) => <span className={s.dateCell}>{fmtDateShort(inv.created_at)}</span>,
    },
    {
      key: 'due_date',
      header: 'Vencimiento',
      render: (inv) => (
        <span className={inv.status === 'overdue' ? s.dateOverdue : s.dateCell}>
          {fmtDateShort(inv.due_date)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '180px',
      align: 'right',
      render: (inv) => (
        <div className={s.actions}>
          {inv.status === 'draft' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                void handleSingleAction(inv.id, 'finalize');
              }}
              disabled={actionLoading === inv.id}
            >
              Enviar
            </Button>
          )}
          {['pending', 'overdue'].includes(inv.status) && (
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                void handleSingleAction(inv.id, 'pay');
              }}
              disabled={actionLoading === inv.id}
            >
              Cobrar
            </Button>
          )}
          {['draft', 'pending'].includes(inv.status) && (
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => {
                e.stopPropagation();
                void handleSingleAction(inv.id, 'cancel');
              }}
              disabled={actionLoading === inv.id}
            >
              Cancelar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              void handleDownloadPdf(inv.id, inv.invoice_number);
            }}
          >
            PDF
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {initialFilters.userId && (
        <div className={s.bannerWrap}>
          <AlertBanner
            variant="info"
            onClose={() => router.push('/admin/billing')}
          >
            Mostrando facturas de un cliente específico
          </AlertBanner>
        </div>
      )}

      <StatusTabs
        tabs={statusTabs}
        active={initialFilters.status}
        onChange={(value) => pushFilters({ status: value })}
      />
      <FilterBar
        search={
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => {
              setSearch('');
              pushFilters({ search: '' });
            }}
            onBlur={() => pushFilters({ search })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pushFilters({ search });
            }}
            placeholder="Buscar factura..."
          />
        }
      />

      <Table<InvoiceItem>
        columns={columns}
        data={invoices}
        rowKey={(inv) => inv.id}
        onRowClick={(inv) => router.push(`/admin/billing/${inv.id}`)}
        emptyIcon={IconInvoice}
        emptyTitle="Sin facturas"
        emptyDescription="No hay facturas que coincidan con los filtros"
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
      />

      {meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={handlePageChange}
        />
      )}

      {selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button size="sm" onClick={() => setBulkAction('pay')}>
            Cobrar seleccionadas
          </Button>
          <Button size="sm" variant="secondary" onClick={handleBulkPdf}>
            Descargar PDF
          </Button>
          <Button size="sm" variant="danger" onClick={() => setBulkAction('cancel')}>
            Cancelar
          </Button>
        </BulkActionBar>
      )}

      <Modal
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        title={
          bulkAction === 'pay'
            ? 'Cobrar facturas en lote'
            : 'Cancelar facturas en lote'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkAction(null)}>
              Cancelar
            </Button>
            <Button
              variant={bulkAction === 'cancel' ? 'danger' : 'primary'}
              loading={bulkLoading}
              onClick={() => bulkAction && void executeBulk(bulkAction)}
            >
              {bulkAction === 'pay'
                ? `Cobrar ${selected.size}`
                : `Cancelar ${selected.size}`}
            </Button>
          </>
        }
      >
        <p className={s.bulkConfirmText}>
          {bulkAction === 'pay'
            ? `¿Marcar ${selected.size} factura${selected.size > 1 ? 's' : ''} como pagada${selected.size > 1 ? 's' : ''}?`
            : `¿Cancelar ${selected.size} factura${selected.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`}
        </p>
      </Modal>
    </>
  );
}

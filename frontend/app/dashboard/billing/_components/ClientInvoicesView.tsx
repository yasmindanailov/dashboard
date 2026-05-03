'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  FilterBar,
  HelpTip,
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
import { downloadInvoicePdfAction } from '../_actions';

/* ═══════════════════════════════════════
   ClientInvoicesView — Sprint 13 §13.AUTH Fase E (Modelo A).
   Recibe data + stats prehidratadas por SC. Maneja:
     - Filtros (búsqueda + status tabs) via searchParams.
     - Paginación via searchParams.
     - Descarga PDF via Server Action que devuelve URL firmada.
   ═══════════════════════════════════════ */

interface InvoiceItem {
  id: string;
  invoice_number: string;
  status: string;
  total: string;
  currency: string;
  due_date: string;
  paid_at: string | null;
  is_manual: boolean;
  created_at: string;
  items: { description: string }[];
}

interface InvoiceStats {
  total_invoices: number;
  pending_count: number;
  paid_count: number;
  overdue_count: number;
}

interface Props {
  invoices: InvoiceItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  stats: InvoiceStats | null;
  initialFilters: { search: string; status: string };
}

const IconInvoice = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

export default function ClientInvoicesView({
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

  function pushFilters(next: { search?: string; status?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const writeOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    };
    if (next.search !== undefined) writeOrDelete('search', next.search);
    if (next.status !== undefined) writeOrDelete('status', next.status);
    params.delete('page');
    startTransition(() => router.push(`/dashboard/billing?${params.toString()}`));
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`/dashboard/billing?${params.toString()}`));
  }

  async function handleDownloadPdf(id: string, invoiceNumber: string) {
    const result = await downloadInvoicePdfAction(id);
    if (!result.ok) {
      toast('error', result.error ?? 'No se pudo generar el PDF');
      return;
    }
    /*
     * El backend firma una URL pre-signed que el browser descarga
     * directamente del bucket (ADR-062 §H two-phase pattern).
     */
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `${invoiceNumber}.pdf`;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const statusTabs: StatusTab[] = [
    { label: 'Todas', value: '', count: stats?.total_invoices },
    { label: 'Pendientes', value: 'pending', count: stats?.pending_count, variant: 'warning' },
    { label: 'Pagadas', value: 'paid', count: stats?.paid_count, variant: 'success' },
    { label: 'Vencidas', value: 'overdue', count: stats?.overdue_count, variant: 'danger' },
  ];

  const columns: TableColumn<InvoiceItem>[] = [
    {
      key: 'invoice_number',
      header: 'Nº Factura',
      render: (inv) => (
        <Link href={`/dashboard/billing/${inv.id}`} className={s.invoiceLink}>
          {inv.invoice_number}
        </Link>
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
      key: 'total',
      header: 'Total',
      width: '120px',
      render: (inv) => <span className={s.totalAmount}>{fmtCurrency(inv.total, inv.currency)}</span>,
    },
    {
      key: 'created_at',
      header: 'Emisión',
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
      key: 'actions',
      header: '',
      width: '80px',
      align: 'right',
      render: (inv) => (
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
      ),
    },
  ];

  return (
    <>
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
        onRowClick={(inv) => router.push(`/dashboard/billing/${inv.id}`)}
        emptyIcon={IconInvoice}
        emptyTitle="Sin facturas"
        emptyDescription="No tienes facturas todavía. Contrata un servicio para empezar."
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
    </>
  );
}

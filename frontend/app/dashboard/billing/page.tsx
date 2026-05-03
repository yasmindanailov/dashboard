/**
 * /dashboard/billing — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Lista paginada de facturas del cliente
 * (backend filtra por ownership). Stats cargadas server-side.
 * Mutaciones (descarga PDF) via Server Action `downloadInvoicePdfAction`.
 * ADR-078 Amendment A1.
 */

import Link from 'next/link';
import { Button, ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import ClientInvoicesView from './_components/ClientInvoicesView';

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
  pending_amount: number;
}
interface PaginatedResponse {
  data: InvoiceItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function ClientInvoicesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);
  const search = singleParam(params.search);
  const status = singleParam(params.status);

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '20');
  if (search) query.set('search', search);
  if (status) query.set('status', status);

  let invoices: InvoiceItem[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 1 };
  let stats: InvoiceStats | null = null;
  try {
    const [list, statsRes] = await Promise.all([
      serverFetch<PaginatedResponse>(`/billing/invoices?${query.toString()}`),
      serverFetch<InvoiceStats>('/billing/invoices/stats'),
    ]);
    invoices = list.data;
    meta = list.meta;
    stats = statsRes;
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
    /* Errores de red/HTTP se reflejan en lista vacía + sin stats. */
  }

  return (
    <ListPage
      title="Mis facturas"
      subtitle="Tus facturas y servicios contratados"
      action={
        <Link href="/dashboard/billing/checkout">
          <Button>Contratar servicio</Button>
        </Link>
      }
    >
      <ClientInvoicesView
        invoices={invoices}
        meta={meta}
        stats={stats}
        initialFilters={{ search, status }}
      />
    </ListPage>
  );
}

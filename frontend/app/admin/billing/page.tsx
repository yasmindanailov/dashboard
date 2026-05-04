/**
 * /admin/billing — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Filtros + paginación via searchParams.
 * Mutaciones individuales y bulk via Server Actions.
 * ADR-078 Amendment A1.
 */

import Link from 'next/link';
import { Button, ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import AdminInvoicesView from './_components/AdminInvoicesView';

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

export default async function AdminInvoicesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);
  const search = singleParam(params.search);
  const status = singleParam(params.status);
  const userId = singleParam(params.userId);

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '20');
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (userId) query.set('user_id', userId);

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
  }

  return (
    <ListPage
      title="Facturación"
      subtitle="Gestión de facturas y cobros"
      action={
        <Link href="/admin/billing/checkout">
          <Button>Crear servicio para cliente</Button>
        </Link>
      }
    >
      <AdminInvoicesView
        invoices={invoices}
        meta={meta}
        stats={stats}
        initialFilters={{ search, status, userId }}
      />
    </ListPage>
  );
}

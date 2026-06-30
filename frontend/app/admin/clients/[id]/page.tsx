/**
 * /admin/clients/[id] — Sprint 13 §13.AUTH Fase E (Modelo A) · reskin F4·U22.
 * Server Component. Carga el detalle del cliente + (eager) servicios, stats de
 * facturación y soporte — alimentan las stat-cards del Resumen y los tabs.
 * Delega a `ClientDetailView` (CC). ADR-078 Amendment A1.
 */

import Link from 'next/link';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { Conversation, Pagination } from '../../../lib/types';
import type {
  ClientBillingStats,
  ClientDetail,
  ClientServiceItem,
  Tab,
} from './types';
import ClientDetailView from './_components/ClientDetailView';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const VALID_TABS: Tab[] = [
  'resumen',
  'servicios',
  'facturacion',
  'soporte',
  'notas',
];

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** serverFetch tolerante: ante un fallo de API devuelve el fallback (no rompe la página). */
async function softFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (err) {
    if (!(err instanceof ServerFetchError)) throw err;
    return fallback;
  }
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }, qs] = await Promise.all([params, searchParams]);

  let client: ClientDetail | null = null;
  try {
    client = await serverFetch<ClientDetail>(`/admin/clients/${id}`);
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  if (!client) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          Cliente no encontrado
        </p>
        <Link
          href="/admin/clients"
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--brand)',
            marginTop: 'var(--space-2)',
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          ← Volver
        </Link>
      </div>
    );
  }

  // Eager (paralelo): servicios + stats de facturación + soporte. Fail-soft.
  const [servicesRes, billingStats, chatsRes, ticketsRes] = await Promise.all([
    softFetch<Pagination<ClientServiceItem>>(
      `/admin/services?user_id=${id}&limit=100`,
      { data: [], meta: { total: 0, page: 1, limit: 100, total_pages: 0 } },
    ),
    softFetch<ClientBillingStats | null>(
      `/billing/invoices/stats?user_id=${id}`,
      null,
    ),
    softFetch<Pagination<Conversation>>(
      `/support/chats?type=chat&user_id=${id}&limit=50`,
      { data: [], meta: { total: 0, page: 1, limit: 50, total_pages: 0 } },
    ),
    softFetch<Pagination<Conversation>>(
      `/support/tickets?type=ticket&user_id=${id}&limit=50`,
      { data: [], meta: { total: 0, page: 1, limit: 50, total_pages: 0 } },
    ),
  ]);

  const tabParam = singleParam(qs.tab) as Tab;
  const initialTab: Tab = VALID_TABS.includes(tabParam) ? tabParam : 'resumen';

  return (
    <ClientDetailView
      client={client}
      initialTab={initialTab}
      services={servicesRes.data}
      billingStats={billingStats}
      supportChats={chatsRes.data}
      supportTickets={ticketsRes.data}
    />
  );
}

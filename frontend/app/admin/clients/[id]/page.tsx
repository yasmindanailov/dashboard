/**
 * /admin/clients/[id] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component. Carga el detalle del cliente server-side y delega
 * a `ClientDetailView` (CC) que orquesta los 4 tabs con lazy load via
 * Server Actions. ADR-078 Amendment A1.
 */

import Link from 'next/link';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { ClientDetail, Tab } from './types';
import ClientDetailView from './_components/ClientDetailView';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const VALID_TABS: Tab[] = ['resumen', 'facturacion', 'soporte', 'notas'];

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
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

  const tabParam = singleParam(qs.tab) as Tab;
  const initialTab: Tab = VALID_TABS.includes(tabParam) ? tabParam : 'resumen';

  return <ClientDetailView client={client} initialTab={initialTab} />;
}

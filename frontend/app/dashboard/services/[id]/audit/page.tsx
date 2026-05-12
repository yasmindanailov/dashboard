/**
 * /dashboard/services/[id]/audit — Sprint 15C.II Fase F.3 (GAP-15CII-M).
 *
 * Server Component nativo: timeline de auditoría del servicio para el
 * **cliente**. El backend (`GET /services/:id/audit`) aplica el recorte
 * GDPR — whitelist explícita de acciones (incluye `admin_sso_impersonation`
 * **con detalle**: nombre del agente + panel, decisión Yasmin 2026-05-12),
 * sin `changes_*`/`correlation_id`/IP del staff, `metadata` recortado por
 * acción. Ownership enforced server-side (cliente solo ve SU servicio).
 *
 * Paginación por URL (`?cursor=…`). Reusa el renderer `<ServiceAuditTimeline>`
 * con `isAdmin={false}` (paralelo a `/admin/services/[id]/audit`).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { ServiceTimelinePage } from '../../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import { t } from '../../../../_shared/i18n';
import { ServiceAuditTimeline } from '../../../../_shared/services/_components/ServiceAuditTimeline';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientServiceAuditPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;

  let page: ServiceTimelinePage;
  try {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    page = await serverFetch<ServiceTimelinePage>(`/services/${id}/audit${qs}`);
  } catch (err) {
    if (err instanceof ServerFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link
          href={`/dashboard/services/${id}`}
          style={{ color: 'var(--text-secondary)' }}
        >
          ← {t('service.audit.back_client')}
        </Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
        {t('service.audit.title')}
      </h1>
      <p
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          margin: '0 0 16px',
        }}
      >
        {t('service.audit.subtitle_client')}
      </p>
      <ServiceAuditTimeline
        page={page}
        isAdmin={false}
        loadMoreHref={(c) =>
          `/dashboard/services/${id}/audit?cursor=${encodeURIComponent(c)}`
        }
      />
    </div>
  );
}

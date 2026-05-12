/**
 * /admin/services/[id]/audit — Sprint 15C.II Fase F.3 (GAP-15CII-M).
 *
 * Server Component nativo: timeline de auditoría del servicio para staff,
 * **sin filtro** (vista completa — `changes_*`, `correlation_id`, IP del
 * staff, metadata íntegra). Paginación por URL (`?cursor=…`) — cada
 * "Cargar más" es una navegación; sin client bundle. El endpoint backend
 * lleva `@AuditAccess('Service')` → consultar este timeline deja a su vez
 * un registro de acceso (coherente con el resto de lecturas staff).
 *
 * Reusa el renderer `<ServiceAuditTimeline>` (`_shared/services/_components/`)
 * con `isAdmin={true}`. El detalle cliente `/dashboard/services/[id]/audit`
 * es el paralelo con `isAdmin={false}` (whitelist GDPR aplicada en backend).
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

export default async function AdminServiceAuditPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;

  let page: ServiceTimelinePage;
  try {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    page = await serverFetch<ServiceTimelinePage>(
      `/admin/services/${id}/audit${qs}`,
    );
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
          href={`/admin/services/${id}`}
          style={{ color: 'var(--text-secondary)' }}
        >
          ← {t('service.audit.back_admin')}
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
        {t('service.audit.subtitle_admin')}
      </p>
      <ServiceAuditTimeline
        page={page}
        isAdmin
        loadMoreHref={(c) =>
          `/admin/services/${id}/audit?cursor=${encodeURIComponent(c)}`
        }
      />
    </div>
  );
}

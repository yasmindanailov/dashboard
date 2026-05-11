/**
 * /admin/services/[id]/dns — Sprint 15C.II Fase E (GAP-15CII-L).
 *
 * Server Component nativo paralelo al detalle cliente
 * `/dashboard/services/[id]/dns/page.tsx` (Sprint 15C Fase 15C.G). Reusa los
 * MISMOS componentes (`DnsRecordsManager` / `DnsExternallyBanner` desde
 * `_shared/services/dns/_components/`) con `isAdmin={true}` y los mismos
 * server actions con el flag `isAdmin` que discrimina la ruta
 * `/admin/services/:id/dns/records` (sin filtro ownership — el backend
 * `AdminProvisioningController` saltea el check con `isAdmin=true`).
 *
 * Diferencias vs el detalle cliente:
 *   - `serverFetch<ServiceDetailResponse>('/admin/services/:id')` para
 *     resolver capabilities + dominio (sin filtro ownership).
 *   - Si `has_dns_management=false` → redirect al detalle admin (defensivo;
 *     el link en `/admin/services/[id]/page.tsx` ya filtra por capability).
 *   - `listDnsRecordsAction(id, true)` → endpoint admin.
 *
 * Ramifica por `info.capabilities.has_dns_management`, NUNCA por slug
 * (ADR-070 + ADR-077 Amendment A1). SC fetch + delegación a CC interactivo
 * (ADR-078 Amendment A1 Modelo A).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '../../../../components/ui';
import type { ServiceDetailResponse } from '../../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import { t } from '../../../../_shared/i18n';
import { listDnsRecordsAction } from '../../../../_shared/services/dns/_actions';
import { DnsExternallyBanner } from '../../../../_shared/services/dns/_components/DnsExternallyBanner';
import { DnsRecordsManager } from '../../../../_shared/services/dns/_components/DnsRecordsManager';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminServiceDnsPage({ params }: PageProps) {
  const { id } = await params;

  // 1. Resolver capabilities + dominio del service (vista admin sin ownership).
  let detail: ServiceDetailResponse | null = null;
  let serviceErrorMessage: string | null = null;
  try {
    detail = await serverFetch<ServiceDetailResponse>(`/admin/services/${id}`);
  } catch (err) {
    serviceErrorMessage =
      err instanceof ServerFetchError ? err.message : 'No se pudo cargar el servicio';
  }

  if (!detail) {
    return (
      <EmptyState
        title="No se pudo cargar el servicio"
        description={serviceErrorMessage ?? 'El servicio no existe.'}
        action={
          <Link href="/admin/services" style={{ color: 'var(--brand-600)' }}>
            ← Volver al listado
          </Link>
        }
      />
    );
  }

  if (!detail.info.capabilities.has_dns_management) {
    redirect(`/admin/services/${id}`);
  }

  const domain = detail.info.display.primary;

  // 2. Resolver DNS records vía Server Action admin (discrimina 404 externally-managed).
  const dnsResult = await listDnsRecordsAction(id, true);

  if (!dnsResult.ok && 'externallyManaged' in dnsResult) {
    return (
      <DnsExternallyBanner
        serviceId={id}
        error={dnsResult.externallyManaged}
        isAdmin
      />
    );
  }

  if (!dnsResult.ok) {
    return (
      <EmptyState
        title="No se pudieron cargar los DNS records"
        description={dnsResult.error}
        action={
          <Link href={`/admin/services/${id}`} style={{ color: 'var(--brand-600)' }}>
            ← Volver al servicio
          </Link>
        }
      />
    );
  }

  if (!dnsResult.data.result.success || !dnsResult.data.result.data) {
    const rawMessage = dnsResult.data.result.message;
    const translatedMessage = rawMessage
      ? t(rawMessage)
      : 'El plugin DNS authority no pudo completar la lectura de la zona. Reintenta en unos minutos.';
    return (
      <EmptyState
        title="DNS no disponible para este servicio ahora"
        description={translatedMessage}
        action={
          <Link href={`/admin/services/${id}`} style={{ color: 'var(--brand-600)' }}>
            ← Volver al servicio
          </Link>
        }
      />
    );
  }

  return (
    <DnsRecordsManager
      serviceId={id}
      domain={domain}
      nameservers={dnsResult.data.nameservers}
      initialZone={dnsResult.data.result.data.zone}
      isAdmin
    />
  );
}

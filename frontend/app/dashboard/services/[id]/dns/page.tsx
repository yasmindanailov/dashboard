/**
 * /dashboard/services/[id]/dns — Sprint 15C Fase 15C.G (ADR-082 §6 + ADR-083 §5).
 * Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
 *
 * Server Component nativo. Pre-fetch del estado DNS:
 *   - Carga `serviceFetch<ServiceDetailResponse>(/services/:id)` para
 *     resolver el dominio + verificar `info.capabilities.has_dns_management`.
 *     Si el plugin del service NO declara DNS management, redirect al detalle
 *     (evita renderizar página vacía cuando no aplica).
 *   - Carga `listDnsRecordsAction(serviceId)`. El resolver backend devuelve
 *     200 + zone si DNS es autoridad Aelium, o 404 + DnsExternallyManagedError
 *     si NS apuntan fuera. La acción discrimina ambos casos.
 *
 * Render condicional:
 *   - 200 → `<DnsRecordsManager>` (CC) con zone prefetcheada.
 *   - 404 externally-managed → `<DnsExternallyBanner>` (SC).
 *   - Error genérico → `<EmptyState>` con mensaje + link de vuelta.
 *
 * Coherente con la doctrina ADR-070 §"Patrón de página":
 *   - UI ramifica por `info.capabilities.has_dns_management`, NUNCA por slug.
 *   - SC fetch + delegación a CC interactivo (ADR-078 Amendment A1 Modelo A).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '../../../../components/ui';
import type { ServiceDetailResponse } from '../../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import { t } from '../../../../_shared/i18n';
import { listDnsRecordsAction } from '../../../../_shared/services/dns/_actions';

import { DnsExternallyBanner } from './_components/DnsExternallyBanner';
import { DnsRecordsManager } from './_components/DnsRecordsManager';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientServiceDnsPage({ params }: PageProps) {
  const { id } = await params;

  // 1. Resolver capabilities + dominio del service.
  let detail: ServiceDetailResponse | null = null;
  let serviceErrorMessage: string | null = null;
  try {
    detail = await serverFetch<ServiceDetailResponse>(`/services/${id}`);
  } catch (err) {
    serviceErrorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el servicio';
  }

  if (!detail) {
    return (
      <EmptyState
        title="No se pudo cargar el servicio"
        description={
          serviceErrorMessage ?? 'El servicio no existe o no tienes acceso.'
        }
        action={
          <Link href="/dashboard/services" style={{ color: 'var(--brand-600)' }}>
            ← Volver al listado
          </Link>
        }
      />
    );
  }

  // Servicio sin DNS management → redirige al detalle (evita página vacía).
  // El link en `/dashboard/services/[id]/page.tsx` ya filtra por capability;
  // este check defensivo cubre URL directa.
  if (!detail.info.capabilities.has_dns_management) {
    redirect(`/dashboard/services/${id}`);
  }

  const domain = detail.info.display.primary;

  // 2. Resolver DNS records vía Server Action (que discrimina 404 externally-managed).
  const dnsResult = await listDnsRecordsAction(id);

  if (!dnsResult.ok && 'externallyManaged' in dnsResult) {
    return (
      <DnsExternallyBanner serviceId={id} error={dnsResult.externallyManaged} />
    );
  }

  if (!dnsResult.ok) {
    return (
      <EmptyState
        title="No se pudieron cargar los DNS records"
        description={dnsResult.error}
        action={
          <Link
            href={`/dashboard/services/${id}`}
            style={{ color: 'var(--brand-600)' }}
          >
            ← Volver al servicio
          </Link>
        }
      />
    );
  }

  // Plugin devolvió `success=false` (sin `data`). Casos típicos:
  //   - Service sin `enhance_website_id` en metadata (provisión incompleta o
  //     seed manual sin el flujo orquestador real).
  //   - Plugin enhance_cp en circuit-open temporal (proveedor caído).
  //   - PluginRegistry no encontró plugin activo (estado raro post-disable).
  // En cualquier caso: NO podemos renderizar la zona. Mostramos mensaje claro
  // + link de vuelta. El usuario puede reintentar más tarde o contactar
  // soporte si persiste.
  if (!dnsResult.data.result.success || !dnsResult.data.result.data) {
    // Sprint 15C.II Fase B fix-up (2026-05-10): el `result.message` que
    // devuelve el backend wrapper es una i18n key (ej. `action.provider_error`,
    // `action.circuit_open`). Lo pasamos por `t()` para traducir; si no
    // hay key declarada o el mensaje ya es una string literal, t() devuelve
    // el original (compat retro).
    const rawMessage = dnsResult.data.result.message;
    const translatedMessage = rawMessage
      ? t(rawMessage)
      : 'El plugin DNS authority no pudo completar la lectura de la zona. Reintenta en unos minutos o contacta con soporte si el problema persiste.';
    return (
      <EmptyState
        title="DNS no disponible para este servicio ahora"
        description={translatedMessage}
        action={
          <Link
            href={`/dashboard/services/${id}`}
            style={{ color: 'var(--brand-600)' }}
          >
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
    />
  );
}

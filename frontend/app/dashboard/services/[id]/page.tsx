/**
 * /dashboard/services/[id] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. ADR-078 Amendment A1.
 *
 * Sprint 15C.II Fase F.12 (layout canónico — R2+R3 frozen §A.11.10.9.2):
 * wrapper fino que compone el `ServiceDetailContext` y delega en
 * `<ServiceDetailLayout>` (plantilla ÚNICA cliente+admin). La composición de
 * secciones vive en el registry declarativo `service-detail-sections.tsx`
 * (cero condiciones inline aquí). UI ramifica por `info.capabilities` (ADR-077)
 * — NUNCA por `service.provisioner_slug` (ADR-070).
 */

import Link from 'next/link';

import { EmptyState } from '../../../components/ui';
import {
  getServerSession,
  serverFetch,
  ServerFetchError,
} from '../../../lib/server-auth';
import type {
  ServiceBillingCrossLink,
  ServiceDetailResponse,
} from '../../../lib/api';
import { isStaffRole } from '../../../lib/portal';
import { ServiceDetailLayout } from '../../../_shared/services/ServiceDetailLayout';
import type { ServiceDetailContext } from '../../../_shared/services/service-detail-context';
import { parseSuspensionReasonCode } from '../../../_shared/services/suspension-reason';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ClientServiceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;

  // Sprint 15C Fase 15C.E.2 — derivar isAdmin server-side (set canónico que
  // coincide con `provisioning.controller.ts` ADMIN_ROLES) para filtrar
  // `availableActions.adminOnly` en `ActionsBar`. Esta página sirve al cliente;
  // los staff que la abren ven la experiencia cliente con los botones admin-only
  // no-blacklisted del plugin (Amendment I: el scope se decide por ruta
  // `forceAdminRoute=false`, NO por rol).
  const session = await getServerSession();
  const isAdmin = isStaffRole(session?.user.role.slug);

  let data: ServiceDetailResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await serverFetch<ServiceDetailResponse>(`/services/${id}`);
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el servicio';
  }

  // Sprint 15C.II Fase F.11.3 — cross-link Service↔billing (fail-soft).
  let billingCrossLink: ServiceBillingCrossLink | null = null;
  if (data) {
    try {
      billingCrossLink = await serverFetch<ServiceBillingCrossLink>(
        `/billing/services/${id}/cross-link`,
      );
    } catch {
      billingCrossLink = null;
    }
  }

  if (!data) {
    return (
      <EmptyState
        title="No se pudo cargar el servicio"
        description={errorMessage ?? 'El servicio no existe o no tienes acceso.'}
        action={
          <Link href="/dashboard/services" style={{ color: 'var(--brand-600)' }}>
            ← Volver al listado
          </Link>
        }
      />
    );
  }

  const { service, info } = data;

  // Estados derivados — replican EXACTAMENTE la lógica del page cliente previo
  // (cero cambio funcional). isTerminal antes que drift (Fase C round 4).
  const isTerminal =
    service.status === 'cancelled' || service.status === 'terminated';
  // Cliente: drift por `info.status` ∈ {unknown, failed}; oculta SSO/DNS/Actions
  // que requieren metadata externa válida (UI_SPEC §4.13 + A4.3).
  const isDrift =
    !isTerminal && (info.status === 'unknown' || info.status === 'failed');
  // Cliente: suspended por `info.status` ya reconciliado (F.4.1).
  const isSuspended = !isTerminal && info.status === 'suspended';
  const suspensionReasonCode = isSuspended
    ? parseSuspensionReasonCode(service.suspension_reason)
    : null;

  const ctx: ServiceDetailContext = {
    data,
    service,
    info,
    billingCrossLink,
    isAdmin,
    forceAdminRoute: false,
    isTerminal,
    isDrift,
    isSuspended,
    suspensionReasonCode,
    pluginHealth: null,
    supportsReconcileOne: false,
    // F3·E8 — la gestión SI ("Plan de soporte" + reasignar técnico) es admin-only.
    supportInside: null,
  };

  return <ServiceDetailLayout ctx={ctx} activeTab={tab ?? 'summary'} />;
}

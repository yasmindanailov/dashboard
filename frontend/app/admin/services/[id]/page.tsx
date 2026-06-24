/**
 * /admin/services/[id] — Sprint 15C Fase 15C.J + Sprint 15C.II Fase E.
 *
 * Sprint 15C.II Fase F.12 (layout canónico — R2+R3 frozen §A.11.10.9.2):
 * wrapper fino paralelo al detalle cliente. Compone el `ServiceDetailContext`
 * con `forceAdminRoute=true` + los datos admin-only (pluginHealth,
 * supportsReconcileOne) e inyecta la extensión `ADMIN_SERVICE_DETAIL_SECTIONS`
 * en el `<ServiceDetailLayout>` (plantilla ÚNICA cliente+admin). La composición
 * de secciones vive en los registries declarativos (cero condiciones inline).
 *
 * Diferencias canónicas vs el detalle cliente (heredadas):
 *   - `GET /admin/services/:id` (sin filtro ownership).
 *   - `isAdmin = true` + `forceAdminRoute = true` siempre.
 *   - Secciones admin-only (datos del servicio, operaciones, drift técnico,
 *     desync, notas, reenviar notif, salud del plugin) vía la extensión.
 */

import Link from 'next/link';

import { EmptyState } from '../../../components/ui';
import type {
  PluginHealthSummary,
  ServiceBillingCrossLink,
  ServiceDetailResponse,
} from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import { t } from '../../../_shared/i18n';
import { ServiceDetailLayout } from '../../../_shared/services/ServiceDetailLayout';
import type { ServiceDetailContext } from '../../../_shared/services/service-detail-context';
import { parseSuspensionReasonCode } from '../../../_shared/services/suspension-reason';

import { AdminServiceActionsMenu } from './_components/AdminServiceActionsMenu';
import { ADMIN_SERVICE_DETAIL_SECTIONS } from './_sections';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminServiceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;

  let data: ServiceDetailResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await serverFetch<ServiceDetailResponse>(`/admin/services/${id}`);
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el servicio';
  }

  // Sprint 15C.II Fase F.9 (R9): capability detection per-plugin para gatear el
  // CTA "Reconciliar" del AdminDriftBanner. Fetch fail-soft (overview F.2 con
  // cache server-side ~600s); si falla, el banner usa fallback F.3.
  let supportsReconcileOne = false;
  const reconcileSlug =
    data?.service.provisioner_slug ?? data?.service.product_provisioner ?? null;
  if (reconcileSlug) {
    try {
      const overview = await serverFetch<{
        reconciliation: { supports_reconcile_one: boolean };
      }>(`/admin/plugins/${reconcileSlug}/operational-overview`);
      supportsReconcileOne =
        overview.reconciliation?.supports_reconcile_one === true;
    } catch {
      supportsReconcileOne = false;
    }
  }

  // Sprint 15C.II Fase F.11.1 (R3): mini-badge de salud del plugin in-process.
  // Fetch fail-soft (admin-only, NO crítico — read-only sobre el registry).
  let pluginHealth: PluginHealthSummary | null = null;
  if (data) {
    try {
      pluginHealth = await serverFetch<PluginHealthSummary>(
        `/admin/services/${id}/plugin-health`,
      );
    } catch {
      pluginHealth = null;
    }
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
        description={errorMessage ?? 'El servicio no existe.'}
        action={
          <Link href="/admin/services" style={{ color: 'var(--brand-600)' }}>
            ← Volver al listado
          </Link>
        }
      />
    );
  }

  const { service, info } = data;

  // Estados derivados — replican EXACTAMENTE la lógica del page admin previo
  // (cero cambio funcional). isTerminal antes que suspended/drift (Fase C r4).
  const isTerminal =
    service.status === 'cancelled' || service.status === 'terminated';
  // Admin: suspended por `service.status` (la verdad canónica de Aelium).
  const isSuspended = !isTerminal && service.status === 'suspended';
  // Admin: drift por `info.status` ∈ {unknown, failed} con statusReason no nulo,
  // y NO si suspended (el banner de suspensión tiene prioridad).
  const isDrift =
    !isTerminal &&
    !isSuspended &&
    (info.status === 'unknown' || info.status === 'failed') &&
    info.statusReason !== null &&
    info.statusReason !== undefined;
  const suspensionReasonCode = isSuspended
    ? parseSuspensionReasonCode(service.suspension_reason)
    : null;

  const ctx: ServiceDetailContext = {
    data,
    service,
    info,
    billingCrossLink,
    isAdmin: true,
    forceAdminRoute: true,
    isTerminal,
    isDrift,
    isSuspended,
    suspensionReasonCode,
    pluginHealth,
    supportsReconcileOne,
  };

  // F.12.5 (Amendment VII): todas las operaciones admin viven en el menú "Más
  // acciones" del header (la tab "Gestión" desapareció). Se inyecta como slot
  // para no acoplar `_shared/` a `app/admin/`.
  const headerActionsMenu = (
    <AdminServiceActionsMenu
      serviceId={service.id}
      serviceDisplayName={info.display.primary}
      actions={info.availableActions}
      currentPlanLabel={
        info.display.secondary ? t(info.display.secondary) : undefined
      }
      isTerminal={isTerminal}
      isDomain={service.product_type === 'domain'}
    />
  );

  return (
    <ServiceDetailLayout
      ctx={ctx}
      activeTab={tab ?? 'summary'}
      extraSections={ADMIN_SERVICE_DETAIL_SECTIONS}
      headerActionsMenu={headerActionsMenu}
    />
  );
}

/**
 * _sections — Sprint 15C.II Fase F.12 (extensión admin del registry).
 *
 * Descriptores admin-only del detalle de servicio (R3 + Amendment I). Viven
 * aquí porque referencian componentes admin-only de `./_components/` (Tier 4
 * R1). El wrapper admin los inyecta vía `extraSections` del
 * `<ServiceDetailLayout>` (evita acoplar `_shared/` a `app/admin/` +
 * materializa R3 regla 6).
 *
 * F.12.4 (Amendment IV): el back-link se fue (lo da el breadcrumb del
 * DetailPage); queda el mini-badge de salud en la zona banner. Operaciones +
 * reenviar notif son cards de la tab Gestión; notas en Actividad.
 */
import { t } from '../../../_shared/i18n';
import type {
  SectionDescriptor,
  ServiceDetailContext,
} from '../../../_shared/services/service-detail-context';
import { AppShortcutsCardSection } from '../../../_shared/services/_components/service-detail-blocks';

import { AdminDriftBanner } from './_components/AdminDriftBanner';
import { AdminProviderStateDesyncBanner } from './_components/AdminProviderStateDesyncBanner';
import { AdminServiceDataCard } from './_components/AdminServiceDataCard';
import { AdminServiceOperationsCard } from './_components/AdminServiceOperationsCard';
import { AdminSuspendedBanner } from './_components/AdminSuspendedBanner';
import { ProviderHealthBadge } from './_components/ProviderHealthBadge';
import { ResendNotificationCard } from './_components/ResendNotificationCard';
import { ServiceNotesCard } from './_components/ServiceNotesCard';

/** Mini-badge de salud del plugin (admin). Zona banner (arriba). */
function AdminHealthBadgeSection({ ctx }: { ctx: ServiceDetailContext }) {
  if (!ctx.pluginHealth) return null;
  return <ProviderHealthBadge health={ctx.pluginHealth} />;
}

function AdminProviderStateDesyncBannerSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  return (
    <AdminProviderStateDesyncBanner
      serviceId={ctx.service.id}
      adminStatus={ctx.service.status === 'suspended' ? 'suspended' : 'active'}
    />
  );
}

function AdminDriftBannerSection({ ctx }: { ctx: ServiceDetailContext }) {
  const { service, info, isDrift, supportsReconcileOne } = ctx;
  if (!info.statusReason) return null;
  return (
    <AdminDriftBanner
      serviceId={service.id}
      statusReason={t(info.statusReason)}
      hasSsoPanel={info.capabilities.hasSsoPanel}
      panelLabel={info.capabilities.panel_label ?? undefined}
      showReprovision={isDrift && info.recoveryHint === 'reprovision'}
      showReconcile={isDrift && info.recoveryHint === 'reconcile'}
      pluginSlug={service.provisioner_slug ?? service.product_provisioner}
      supportsReconcileOne={supportsReconcileOne}
    />
  );
}

function AdminServiceDataCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  return <AdminServiceDataCard data={ctx.data} />;
}

function AdminServiceOperationsCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service, info } = ctx;
  return (
    <AdminServiceOperationsCard
      serviceId={service.id}
      actions={info.availableActions}
      currentPlanLabel={
        info.display.secondary ? t(info.display.secondary) : undefined
      }
      serviceDisplayName={info.display.primary}
    />
  );
}

function ResendNotificationCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  return (
    <ResendNotificationCard
      serviceId={ctx.service.id}
      serviceDisplayName={ctx.info.display.primary}
    />
  );
}

function ServiceNotesCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <ServiceNotesCard
      serviceId={ctx.service.id}
      clientUserId={ctx.service.user_id}
    />
  );
}

export const ADMIN_SERVICE_DETAIL_SECTIONS: readonly SectionDescriptor[] = [
  // ── Zona banner ──
  {
    id: 'admin-provider-health-badge',
    label: 'Mini-badge salud del plugin',
    scope: 'admin',
    group: 'banner',
    priority: 1950,
    shouldRender: (ctx) => ctx.pluginHealth !== null,
    component: AdminHealthBadgeSection,
  },
  {
    id: 'banner-suspended-admin',
    label: 'Banner suspensión (admin)',
    scope: 'admin',
    group: 'banner',
    priority: 1750,
    shouldRender: (ctx) => ctx.isSuspended,
    component: AdminSuspendedBanner,
  },
  {
    id: 'banner-provider-state-desync',
    label: 'Banner desync estado proveedor',
    scope: 'admin',
    group: 'banner',
    priority: 1700,
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      ctx.service.provider_state_desync === true &&
      (ctx.service.status === 'active' || ctx.service.status === 'suspended'),
    component: AdminProviderStateDesyncBannerSection,
  },
  {
    id: 'banner-drift-admin',
    label: 'Banner drift técnico (admin)',
    scope: 'admin',
    group: 'banner',
    priority: 1650,
    shouldRender: (ctx) =>
      ctx.isDrift &&
      ctx.info.statusReason !== null &&
      ctx.info.statusReason !== undefined,
    component: AdminDriftBannerSection,
  },
  // ── Tab "Resumen" ──
  {
    id: 'apps-card-admin',
    label: 'Apps instaladas (admin)',
    scope: 'admin',
    group: 'summary',
    priority: 400,
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      ctx.info.apps !== undefined &&
      ctx.info.apps.length > 0,
    component: AppShortcutsCardSection,
  },
  {
    id: 'admin-service-data-card',
    label: 'Datos del servicio (admin)',
    scope: 'admin',
    group: 'summary',
    priority: 300,
    shouldRender: () => true,
    component: AdminServiceDataCardSection,
  },
  // ── Tab "Gestión" ──
  {
    id: 'admin-service-operations-card',
    label: 'Operaciones',
    scope: 'admin',
    group: 'management',
    priority: 70,
    shouldRender: (ctx) => !ctx.isTerminal,
    component: AdminServiceOperationsCardSection,
  },
  {
    id: 'resend-notification-card',
    label: 'Reenviar notificación',
    scope: 'admin',
    group: 'management',
    priority: 60,
    shouldRender: () => true,
    component: ResendNotificationCardSection,
  },
  // ── Tab "Actividad" ──
  {
    id: 'service-notes-card',
    label: 'Notas del servicio',
    scope: 'admin',
    group: 'activity',
    priority: 50,
    shouldRender: () => true,
    component: ServiceNotesCardSection,
  },
];

/**
 * _sections — Sprint 15C.II Fase F.12 (layout canónico, extensión admin del registry).
 *
 * Descriptores admin-only del detalle de servicio (R3 frozen + Amendment I).
 * Viven aquí —y NO en `_shared/services/`— porque referencian componentes
 * admin-only que viven en `./_components/` (Tier 4 R1). El wrapper admin
 * (`page.tsx`) los inyecta vía `extraSections` del `<ServiceDetailLayout>`.
 * Así `_shared/` no depende de `app/admin/` y se materializa la regla 6 de R3
 * (concatenación de arrays — heredable a plugins futuros 15D/15E/15G).
 *
 * **Cero cambio funcional** (F.12.2): cada adapter reproduce la invocación y el
 * guard inline del `/admin/services/[id]/page.tsx` actual.
 */
import Link from 'next/link';

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

/** Fila de cabecera admin: back-link "← Servicios" + ProviderHealthBadge
 *  (top-right, misma fila flex). Fusiona el back-link y el badge en una sola
 *  sección para preservar el layout `justify-between` del page actual
 *  (Amendment I — el freeze los listaba como descriptores separados). */
function AdminHeaderRowSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <Link
        href="/admin/services"
        style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        ← Servicios
      </Link>
      {ctx.pluginHealth && <ProviderHealthBadge health={ctx.pluginHealth} />}
    </div>
  );
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
  {
    id: 'header-admin-row',
    label: 'Cabecera admin (back-link + salud plugin)',
    scope: 'admin',
    priority: 2000,
    shouldRender: () => true,
    component: AdminHeaderRowSection,
  },
  {
    id: 'banner-suspended-admin',
    label: 'Banner suspensión (admin)',
    scope: 'admin',
    priority: 1750,
    shouldRender: (ctx) => ctx.isSuspended,
    component: AdminSuspendedBanner,
  },
  {
    id: 'banner-provider-state-desync',
    label: 'Banner desync estado proveedor',
    scope: 'admin',
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
    priority: 1650,
    shouldRender: (ctx) =>
      ctx.isDrift &&
      ctx.info.statusReason !== null &&
      ctx.info.statusReason !== undefined,
    component: AdminDriftBannerSection,
  },
  {
    id: 'apps-card-admin',
    label: 'Apps instaladas (admin)',
    scope: 'admin',
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
    priority: 300,
    shouldRender: () => true,
    component: AdminServiceDataCardSection,
  },
  {
    id: 'admin-service-operations-card',
    label: 'Operaciones admin',
    scope: 'admin',
    priority: 70,
    shouldRender: (ctx) => !ctx.isTerminal,
    component: AdminServiceOperationsCardSection,
  },
  {
    id: 'resend-notification-card',
    label: 'Reenviar notificación',
    scope: 'admin',
    priority: 60,
    shouldRender: () => true,
    component: ResendNotificationCardSection,
  },
  {
    id: 'service-notes-card',
    label: 'Notas del servicio',
    scope: 'admin',
    priority: 50,
    shouldRender: () => true,
    component: ServiceNotesCardSection,
  },
];

/**
 * _sections — Sprint 15C.II Fase F.12 → F.12.5 (extensión admin del registry).
 *
 * Descriptores admin-only del detalle de servicio (R3 + Amendment I). Viven
 * aquí porque referencian componentes admin-only de `./_components/` (Tier 4
 * R1). El wrapper admin los inyecta vía `extraSections` del
 * `<ServiceDetailLayout>` (evita acoplar `_shared/` a `app/admin/`).
 *
 * F.12.5 (Amendment VII): se elimina la tab "Gestión" — todas las operaciones
 * admin (cambiar plan / reenviar / suspender / cancelar) viven en el menú "Más
 * acciones" del header (`<AdminServiceActionsMenu>`, inyectado vía
 * `headerActionsMenu`). El recalcular vive en la card "Recursos". La salud del
 * plugin se reubicó a la card "Datos técnicos" (ya no es un banner). Las notas
 * pasan a su tab dedicado (`group: 'notes'`).
 *
 * Quedan aquí: banners admin (suspendido / desync / drift) + apps + datos
 * técnicos (summary) + notas (tab propio).
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
import { AdminSuspendedBanner } from './_components/AdminSuspendedBanner';
import { ServiceNotesCard } from './_components/ServiceNotesCard';
import { SupportInsidePlanCard } from './_components/SupportInsidePlanCard';

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
  return <AdminServiceDataCard data={ctx.data} pluginHealth={ctx.pluginHealth} />;
}

function ServiceNotesCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <ServiceNotesCard
      serviceId={ctx.service.id}
      clientUserId={ctx.service.user_id}
    />
  );
}

function SupportInsidePlanCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  // `shouldRender` garantiza `supportInside != null`; el `!` documenta el contrato.
  return <SupportInsidePlanCard managed={ctx.supportInside!} />;
}

export const ADMIN_SERVICE_DETAIL_SECTIONS: readonly SectionDescriptor[] = [
  // ── Zona banner ──
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
    id: 'support-inside-plan-card',
    label: 'Plan de soporte (Support Inside, admin)',
    scope: 'admin',
    group: 'summary',
    column: 'main',
    // Sobre "Apps" (400): es la card primaria del servicio SI gestionado.
    priority: 450,
    // F3·E8 — capability-driven por presencia del bloque; oculta en terminal
    // (1:1 con el mockup: la card "Plan de soporte" desaparece si cancelado).
    shouldRender: (ctx) => ctx.supportInside !== null && !ctx.isTerminal,
    component: SupportInsidePlanCardSection,
  },
  {
    id: 'apps-card-admin',
    label: 'Apps instaladas (admin)',
    scope: 'admin',
    group: 'summary',
    column: 'main',
    priority: 400,
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      ctx.info.apps !== undefined &&
      ctx.info.apps.length > 0,
    component: AppShortcutsCardSection,
  },
  {
    id: 'admin-service-data-card',
    label: 'Datos técnicos (admin)',
    scope: 'admin',
    group: 'summary',
    column: 'aside',
    priority: 300,
    shouldRender: () => true,
    component: AdminServiceDataCardSection,
  },
  // ── Tab "Notas" ──
  {
    id: 'service-notes-card',
    label: 'Notas del servicio',
    scope: 'admin',
    group: 'notes',
    priority: 50,
    shouldRender: () => true,
    component: ServiceNotesCardSection,
  },
];

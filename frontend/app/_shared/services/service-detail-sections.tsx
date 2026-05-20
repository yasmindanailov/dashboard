/**
 * service-detail-sections — Sprint 15C.II Fase F.12 (layout canónico, R3 frozen).
 *
 * Registry BASE declarativo del detalle de servicio: descriptores cuyos
 * componentes viven en `_shared/services/` (scope `both` + `client`). Los
 * admin-only viven en `app/admin/services/[id]/_sections.tsx` (extensión
 * inyectada vía `extraSections` — Amendment I).
 *
 * F.12.4 (Amendment IV): identidad + metadata + clúster de acciones se movieron
 * al `<ServiceHeaderCard>`; el registry cubre banners + cards de tab + footer.
 * El `<ServiceDetailLayout>` agrupa por `group`, filtra por `matchesScope` +
 * `shouldRender(ctx)` y ordena por `priority`.
 */
import type { SectionDescriptor } from './service-detail-context';
import {
  AppShortcutsCardSection,
  BillingCrossLinkCardSection,
  ClientDevCustomPlaceholderSection,
  ClientSuspendedBannerSection,
  FetchedAtFooterSection,
  MetricsBarSection,
  ServiceAuditLinkCardSection,
  SslStatusCardSection,
  TerminalBannerSection,
} from './_components/service-detail-blocks';

export const SERVICE_DETAIL_SECTIONS: readonly SectionDescriptor[] = [
  // ── Zona banner (siempre visible bajo el headerCard, sobre las tabs) ──
  {
    id: 'banner-terminal',
    label: 'Banner servicio terminal',
    scope: 'both',
    group: 'banner',
    priority: 1800,
    shouldRender: (ctx) => ctx.isTerminal,
    component: TerminalBannerSection,
  },
  {
    id: 'banner-suspended-client',
    label: 'Banner suspensión (cliente)',
    scope: 'client',
    group: 'banner',
    priority: 1750,
    shouldRender: (ctx) => ctx.isSuspended && ctx.suspensionReasonCode !== null,
    component: ClientSuspendedBannerSection,
  },
  // ── Tab "Resumen" ──
  {
    id: 'metrics-bar',
    label: 'Métricas',
    scope: 'both',
    group: 'summary',
    priority: 600,
    shouldRender: (ctx) => !ctx.isTerminal && ctx.info.capabilities.has_metrics,
    component: MetricsBarSection,
  },
  {
    id: 'ssl-card',
    label: 'Estado SSL',
    scope: 'both',
    group: 'summary',
    priority: 500,
    shouldRender: (ctx) => !ctx.isTerminal && Boolean(ctx.info.ssl),
    component: SslStatusCardSection,
  },
  {
    id: 'apps-card-client',
    label: 'Apps instaladas (cliente)',
    scope: 'client',
    group: 'summary',
    priority: 400,
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      !ctx.isSuspended &&
      ctx.info.apps !== undefined &&
      ctx.info.apps.length > 0,
    component: AppShortcutsCardSection,
  },
  {
    id: 'billing-cross-link-card',
    label: 'Cross-link facturación',
    scope: 'both',
    group: 'summary',
    priority: 350,
    shouldRender: (ctx) => ctx.billingCrossLink !== null,
    component: BillingCrossLinkCardSection,
  },
  {
    id: 'client-dev-custom-placeholder',
    label: 'Placeholder desarrollo a medida (Sprint 22)',
    scope: 'client',
    group: 'summary',
    priority: 20,
    shouldRender: () => true,
    component: ClientDevCustomPlaceholderSection,
  },
  // ── Tab "Actividad" ──
  {
    id: 'audit-link-card',
    label: 'Historial de auditoría',
    scope: 'both',
    group: 'activity',
    priority: 30,
    shouldRender: () => true,
    component: ServiceAuditLinkCardSection,
  },
  // ── Zona footer (siempre visible bajo las tabs) ──
  {
    id: 'footer-fetched-at',
    label: 'Footer última lectura',
    scope: 'both',
    group: 'footer',
    priority: 1,
    shouldRender: () => true,
    component: FetchedAtFooterSection,
  },
];

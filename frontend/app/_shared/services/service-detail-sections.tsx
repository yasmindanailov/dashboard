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
  ClientHelpCardSection,
  ClientSuspendedBannerSection,
  FetchedAtFooterSection,
  MetricsBarSection,
  PlanChangeCardSection,
  ServiceAuditTabSection,
  ServiceOverviewCardSection,
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
  // ── Tab "Resumen" — layout main + aside (F.12.5) ──
  // MAIN (2fr): recursos, SSL, aplicaciones (lo que "lidera" el overview).
  // Card "Información del servicio": llena el MAIN cuando no hay cards "rich"
  // (métricas/SSL/apps) — servicios mínimos (`internal`/`manual`/`support_inside`)
  // Y servicios terminales/suspendidos sin métricas, donde el MAIN quedaría
  // vacío. Garantiza el layout de 2 columnas (punto 7 + Amendment VIII).
  {
    id: 'service-overview-card',
    label: 'Información del servicio',
    scope: 'both',
    group: 'summary',
    column: 'main',
    priority: 650,
    shouldRender: (ctx) => {
      const hasRichMain =
        ctx.info.capabilities.has_metrics ||
        Boolean(ctx.info.ssl) ||
        (ctx.info.apps !== undefined && ctx.info.apps.length > 0);
      // Terminal: las cards rich están ocultas (gateadas !terminal) → MAIN
      // vacío → esta card lo llena. No-terminal: solo si el plugin no aporta
      // métricas/SSL/apps (servicio mínimo).
      return ctx.isTerminal || !hasRichMain;
    },
    component: ServiceOverviewCardSection,
  },
  {
    id: 'metrics-bar',
    label: 'Recursos',
    scope: 'both',
    group: 'summary',
    column: 'main',
    priority: 600,
    shouldRender: (ctx) => !ctx.isTerminal && ctx.info.capabilities.has_metrics,
    component: MetricsBarSection,
  },
  {
    id: 'ssl-card',
    label: 'Estado SSL',
    scope: 'both',
    group: 'summary',
    column: 'main',
    priority: 500,
    shouldRender: (ctx) => !ctx.isTerminal && Boolean(ctx.info.ssl),
    component: SslStatusCardSection,
  },
  {
    id: 'apps-card-client',
    label: 'Apps instaladas (cliente)',
    scope: 'client',
    group: 'summary',
    column: 'main',
    priority: 400,
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      !ctx.isSuspended &&
      ctx.info.apps !== undefined &&
      ctx.info.apps.length > 0,
    component: AppShortcutsCardSection,
  },
  // ASIDE (1fr): facturación, ayuda (cliente), placeholder, datos técnicos (admin).
  {
    id: 'billing-cross-link-card',
    label: 'Cross-link facturación',
    scope: 'both',
    group: 'summary',
    column: 'aside',
    priority: 350,
    shouldRender: (ctx) => ctx.billingCrossLink !== null,
    component: BillingCrossLinkCardSection,
  },
  // Cambio de plan con prorrateo (ADR-029). Bajo facturación; solo servicios
  // activos no-terminales y no-dominio (los dominios no hacen cambio de ciclo).
  // scope CLIENTE: en el detalle ADMIN esta acción vive en el menú "Más
  // acciones" (decisión Yasmin F4·U24 — sin card, 1:1 con el mockup del kebab).
  {
    id: 'plan-change-card',
    label: 'Cambiar de plan (prorrateo)',
    scope: 'client',
    group: 'summary',
    column: 'aside',
    priority: 340,
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      !ctx.isSuspended &&
      ctx.service.product_type !== 'domain',
    component: PlanChangeCardSection,
  },
  {
    id: 'client-help-card',
    label: 'Ayuda / soporte (cliente)',
    scope: 'client',
    group: 'summary',
    column: 'aside',
    priority: 30,
    shouldRender: (ctx) => !ctx.isTerminal,
    component: ClientHelpCardSection,
  },
  {
    id: 'client-dev-custom-placeholder',
    label: 'Placeholder desarrollo a medida (Sprint 22)',
    scope: 'client',
    group: 'summary',
    column: 'aside',
    priority: 20,
    // No tiene sentido el teaser de Sprint 22 en un servicio cancelado.
    shouldRender: (ctx) => !ctx.isTerminal,
    component: ClientDevCustomPlaceholderSection,
  },
  // ── Tab "Auditoría" (preview + enlace a la página completa) ──
  {
    id: 'audit-tab',
    label: 'Historial de auditoría',
    scope: 'both',
    group: 'audit',
    priority: 30,
    shouldRender: () => true,
    component: ServiceAuditTabSection,
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

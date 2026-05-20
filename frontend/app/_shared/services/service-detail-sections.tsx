/**
 * service-detail-sections — Sprint 15C.II Fase F.12 (layout canónico, R3 frozen).
 *
 * Registry BASE declarativo del detalle de servicio. Contiene los descriptores
 * cuyos componentes viven en `_shared/services/` (scope `both` + `client`). Los
 * descriptores admin-only (componentes en `app/admin/services/[id]/_components/`)
 * viven en la extensión `app/admin/services/[id]/_sections.tsx` y se concatenan
 * via la prop `extraSections` del `<ServiceDetailLayout>` (Amendment I —
 * materializa la regla 6 de R3: "concatenación de arrays" + evita que `_shared/`
 * dependa de `app/admin/`).
 *
 * El `<ServiceDetailLayout>` itera `[...SERVICE_DETAIL_SECTIONS, ...extra]`,
 * filtra por `matchesScope` + `shouldRender(ctx)` y ordena por `priority`
 * descendente. Cero condiciones inline en el padre.
 *
 * **Cero cambio funcional** (F.12.2): cada `shouldRender` reproduce el guard
 * inline del page actual. Los guards route-divergentes (sso/actions/dns)
 * ramifican por `ctx.forceAdminRoute` para preservar el comportamiento exacto
 * de cliente y admin (Amendment I — el page cliente gatea
 * `!isSuspended`/`!isDrift`, el admin solo `!isTerminal`).
 */
import type { SectionDescriptor } from './service-detail-context';
import {
  ActionsBarSection,
  AppShortcutsCardSection,
  BillingCrossLinkCardSection,
  ClientBackLinkSection,
  ClientDevCustomPlaceholderSection,
  ClientServiceDetailsCardSection,
  ClientSuspendedBannerSection,
  DnsLinkCardSection,
  FetchedAtFooterSection,
  MetricsBarSection,
  ServiceAuditLinkCardSection,
  ServiceHeaderSection,
  SslStatusCardSection,
  SsoPanelCardSection,
  TerminalBannerSection,
} from './_components/service-detail-blocks';

export const SERVICE_DETAIL_SECTIONS: readonly SectionDescriptor[] = [
  // ── Zona cabecera (siempre visible, fuera de tabs) ──
  {
    id: 'header-back-link',
    label: 'Back link cliente',
    scope: 'client',
    group: 'header',
    priority: 2000,
    shouldRender: () => true,
    component: ClientBackLinkSection,
  },
  {
    id: 'service-header',
    label: 'Cabecera del servicio',
    scope: 'both',
    group: 'header',
    priority: 1900,
    shouldRender: () => true,
    component: ServiceHeaderSection,
  },
  {
    id: 'banner-terminal',
    label: 'Banner servicio terminal',
    scope: 'both',
    group: 'header',
    priority: 1800,
    shouldRender: (ctx) => ctx.isTerminal,
    component: TerminalBannerSection,
  },
  {
    id: 'banner-suspended-client',
    label: 'Banner suspensión (cliente)',
    scope: 'client',
    group: 'header',
    priority: 1750,
    shouldRender: (ctx) => ctx.isSuspended && ctx.suspensionReasonCode !== null,
    component: ClientSuspendedBannerSection,
  },
  // ── Tab "Resumen" ──
  {
    id: 'client-details-card',
    label: 'Detalles del servicio (cliente)',
    scope: 'client',
    group: 'summary',
    priority: 800,
    shouldRender: () => true,
    component: ClientServiceDetailsCardSection,
  },
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
  // ── Tab "Gestión" ──
  {
    id: 'sso-panel-card',
    label: 'Panel del proveedor (SSO)',
    scope: 'both',
    group: 'management',
    priority: 90,
    // Cliente: !terminal && !suspended && !drift. Admin: solo !terminal
    // (Amendment I — preserva la divergencia de gating entre ambos pages).
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      ctx.info.capabilities.hasSsoPanel &&
      ctx.info.capabilities.panel_label !== undefined &&
      ctx.info.capabilities.panel_label !== null &&
      (ctx.forceAdminRoute || (!ctx.isSuspended && !ctx.isDrift)),
    component: SsoPanelCardSection,
  },
  {
    id: 'actions-bar',
    label: 'Acciones del servicio',
    scope: 'both',
    group: 'management',
    priority: 80,
    // Cliente: !terminal && !suspended. Admin: solo !terminal.
    shouldRender: (ctx) =>
      !ctx.isTerminal && (ctx.forceAdminRoute || !ctx.isSuspended),
    component: ActionsBarSection,
  },
  {
    id: 'dns-link-card',
    label: 'Gestión DNS',
    scope: 'both',
    group: 'management',
    priority: 40,
    // Cliente: !terminal && !suspended && !drift. Admin: solo !terminal.
    shouldRender: (ctx) =>
      !ctx.isTerminal &&
      ctx.info.capabilities.has_dns_management &&
      (ctx.forceAdminRoute || (!ctx.isSuspended && !ctx.isDrift)),
    component: DnsLinkCardSection,
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
  // ── Zona pie (siempre visible, fuera de tabs) ──
  {
    id: 'client-dev-custom-placeholder',
    label: 'Placeholder desarrollo a medida (Sprint 22)',
    scope: 'client',
    group: 'footer',
    priority: 20,
    shouldRender: () => true,
    component: ClientDevCustomPlaceholderSection,
  },
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

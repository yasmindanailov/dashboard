/**
 * service-detail-blocks — Sprint 15C.II Fase F.12 (layout canónico).
 *
 * Componentes de sección del registry BASE (`SERVICE_DETAIL_SECTIONS`): banners
 * (zona siempre visible), cards de tab (grid 2-col) y footer. Cada uno recibe
 * el `ServiceDetailContext` y monta su sección.
 *
 * F.12.3 (Amendment III): DS + CSS module + i18n. F.12.4 (Amendment IV): la
 * identidad, metadata y el clúster de acciones (SSO/DNS/acciones rápidas) se
 * movieron al `<ServiceHeaderCard>` (headerCard del DetailPage); aquí quedan
 * solo banners + cards de contenido + footer.
 *
 * Presentacional puro — Server-component compatible (sin `'use client'`).
 */
import Link from 'next/link';
import { Clock } from 'lucide-react';

import {
  AlertBanner,
  DescriptionList,
  SectionCard,
  type DescriptionItem,
} from '../../../components/ui';
import { t } from '../../i18n';
import type { ServiceTimelinePage } from '../../../lib/api';
import { serverFetch } from '../../../lib/server-auth';
import type { ServiceDetailContext } from '../service-detail-context';
import { MetricsBar } from '../MetricsBar';
import { SslStatusCard } from '../SslStatusCard';
import { AppShortcutsCard } from '../AppShortcutsCard';
import { BillingCrossLinkCard } from '../BillingCrossLinkCard';
import { AutoRenewToggle } from '../AutoRenewToggle';
import { ChangePlanCard } from './ChangePlanCard';
import { ServiceAuditTimeline } from './ServiceAuditTimeline';
import styles from '../service-detail.module.css';

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Card "Información del servicio" (F.12.5 punto 7, Amendment VII). Aparece SOLO
 * en servicios mínimos (sin métricas/SSL/apps) para dar contenido al MAIN del
 * overview y lograr el layout main+aside también en `internal`/`manual`/
 * `support_inside`. Capability-agnóstico (no ramifica por provisioner): estado
 * (badge + narrativa) + datos clave (plan/alta/renovación). scope both.
 */
export function ServiceOverviewCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { info, service, billingCrossLink, isTerminal } = ctx;
  const items: DescriptionItem[] = [];
  if (info.display.secondary) {
    items.push({
      key: 'plan',
      term: t('service.overview.plan'),
      value: t(info.display.secondary),
    });
  }
  items.push({
    key: 'contracted',
    term: t('service.overview.contracted'),
    value: formatLongDate(service.created_at),
  });
  // Renovación: NO en servicios terminales (cancelado/terminado no renueva —
  // sería incoherente, Amendment VIII). Para terminal, fecha de cancelación.
  const renewal = billingCrossLink?.nextDueDate ?? info.display.expiresAt;
  if (renewal && !isTerminal) {
    items.push({
      key: 'renewal',
      term: t('service.overview.renewal'),
      value: formatLongDate(renewal),
    });
  }
  if (isTerminal && service.cancelled_at) {
    items.push({
      key: 'cancelled',
      term: t('service.overview.cancelled'),
      value: formatLongDate(service.cancelled_at),
    });
  }
  return (
    <SectionCard title={t('service.overview.card_title')}>
      {/* Sin badge de estado ni narrativa de estado: el estado ya vive en el
          badge del header (fuente única — D4). Aquí solo los hechos
          (plan/alta/renovación/cancelado) + el motivo técnico si lo hay
          (diagnóstico, no duplica el estado). */}
      {!isTerminal && info.statusReason && (
        <p className={styles.cardTextMuted}>{t(info.statusReason)}</p>
      )}
      <DescriptionList layout="divided" items={items} />
    </SectionCard>
  );
}

/* ── Zona banner (siempre visible bajo el headerCard, sobre las tabs) ── */

/** Banner de servicio terminal (cancelled/terminated). scope both. */
export function TerminalBannerSection({ ctx }: { ctx: ServiceDetailContext }) {
  const { service, info, forceAdminRoute } = ctx;
  if (forceAdminRoute) {
    return (
      <AlertBanner
        variant="danger"
        title={t('service.terminal.cancelled.admin.title')}
      >
        <div className={styles.bannerStack}>
          <p className={styles.bannerText}>
            {t('service.terminal.cancelled.admin.body')}
          </p>
          {info.statusReason && (
            <p className={styles.terminalReason}>{t(info.statusReason)}</p>
          )}
          {service.cancellation_reason && (
            <p className={styles.terminalCode}>
              cancellation_reason: <code>{service.cancellation_reason}</code>
              {service.cancelled_at &&
                ` · ${new Date(service.cancelled_at).toLocaleString('es-ES')}`}
            </p>
          )}
        </div>
      </AlertBanner>
    );
  }
  return (
    <AlertBanner
      variant="info"
      title={t('service.terminal.cancelled.client.title')}
    >
      <p className={styles.bannerText}>
        {t('service.terminal.cancelled.client.body')}
      </p>
      {service.cancelled_at && (
        <p className={styles.bannerMeta}>
          {t('service.detail.cancelled_at')} {formatLongDate(service.cancelled_at)}
        </p>
      )}
    </AlertBanner>
  );
}

/** Banner de suspensión para el cliente (motivo localizado + CTA por motivo —
 *  NUNCA la nota interna del admin). scope client. */
export function ClientSuspendedBannerSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service, suspensionReasonCode } = ctx;
  if (!suspensionReasonCode) return null;
  return (
    <AlertBanner variant="warning" title={t('service.suspended.client.title')}>
      <div className={styles.bannerStack}>
        <p className={styles.bannerText}>{t('service.suspended.client.body')}</p>
        <p className={styles.bannerText}>
          <strong>{t('service.suspended.client.reason_label')}:</strong>{' '}
          {t(`service.suspension_reason.${suspensionReasonCode}`)}
        </p>
        <div>
          {suspensionReasonCode === 'overdue_payment' ? (
            <Link href="/dashboard/billing" className={styles.ctaPrimary}>
              {t('service.suspended.client.cta_pay')}
            </Link>
          ) : suspensionReasonCode === 'not_renewed' ? (
            // F4·W3 — no renovado: la recuperación es recontratar (no hay flujo de
            // reactivación de hosting) → ficha de tienda del producto.
            <Link
              href={`/dashboard/store/${service.product_slug}`}
              className={styles.ctaPrimary}
            >
              {t('service.suspended.client.cta_recontract')}
            </Link>
          ) : (
            <Link href="/dashboard/support" className={styles.ctaSecondary}>
              {t('service.suspended.client.cta_support')}
            </Link>
          )}
        </div>
        {service.suspended_at && (
          <p className={styles.bannerMeta}>
            {t('service.detail.suspended_at')}{' '}
            {formatLongDate(service.suspended_at)}
          </p>
        )}
      </div>
    </AlertBanner>
  );
}

/* ── Cards de tab ── */

/** MetricsBar ("Recursos") — adapter. `isAdmin` = `forceAdminRoute` (chrome).
 *  `canRecalculate` por presencia de la action (F.12.5 punto 2). */
export function MetricsBarSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <MetricsBar
      metrics={ctx.info.metrics ?? { fetchedAt: ctx.info.fetchedAt }}
      serviceId={ctx.service.id}
      isAdmin={ctx.forceAdminRoute}
      quotaAlertThresholdPct={ctx.service.quota_alert_threshold_pct}
      canRecalculate={ctx.info.availableActions.some(
        (a) => a.slug === 'recalculate_provider_metrics',
      )}
    />
  );
}

/** SslStatusCard — adapter. `isAdmin` = `forceAdminRoute` (tooltip ISO admin). */
export function SslStatusCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  if (!ctx.info.ssl) return null;
  return <SslStatusCard ssl={ctx.info.ssl} isAdmin={ctx.forceAdminRoute} />;
}

/** AppShortcutsCard — adapter (apps-card-client base + apps-card-admin
 *  extensión). `isAdmin` = `ctx.isAdmin` (tooltip + acciones). */
export function AppShortcutsCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  if (!ctx.info.apps || ctx.info.apps.length === 0) return null;
  return (
    <AppShortcutsCard
      apps={ctx.info.apps}
      serviceId={ctx.service.id}
      isAdmin={ctx.isAdmin}
    />
  );
}

/** BillingCrossLinkCard — adapter. `isAdmin` = `forceAdminRoute` (link a
 *  /admin o /dashboard billing según ruta). */
export function BillingCrossLinkCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  if (!ctx.billingCrossLink) return null;
  return (
    <BillingCrossLinkCard
      data={ctx.billingCrossLink}
      isAdmin={ctx.forceAdminRoute}
      isTerminal={ctx.isTerminal}
    />
  );
}

/** Card del cambio de plan con prorrateo (ADR-029). CC: picker + preview + confirm. */
export function PlanChangeCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  return <ChangePlanCard serviceId={ctx.service.id} />;
}

/** Card "Renovación" (aside, cliente) — toggle de auto-renovación (F4·W3). */
export function AutoRenewCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <SectionCard title={t('service.autorenew.card_title')}>
      <AutoRenewToggle
        serviceId={ctx.service.id}
        enabled={ctx.service.auto_renew}
        kind="service"
      />
    </SectionCard>
  );
}

/**
 * Tab "Auditoría" (F.12.5 punto 5 · reskin 1:1 F4·U24). Async Server Component:
 * fetcha la primera página del timeline y muestra un **preview** (últimas N
 * entradas, reusa `<ServiceAuditTimeline>` con `IconWell`) + enlace "Ver
 * historial completo →" al pie. 1:1 con el mockup (`admin/ServicioDetalleAdmin
 * .dc.html` §Auditoría): título "Actividad reciente" + contador "Últimas N" a la
 * derecha + link al fondo. Fail-soft: si el fetch falla, degrada al link. scope
 * both (cliente ve su scope GDPR).
 */
const AUDIT_PREVIEW_LIMIT = 5;

export async function ServiceAuditTabSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service, forceAdminRoute } = ctx;
  // OJO: el endpoint del API NO es la ruta de Next.
  //   - API backend: admin `/admin/services/:id/audit` · cliente `/services/:id/audit`.
  //   - Ruta de Next (enlace "Ver historial completo"): admin `/admin/services/:id/audit`
  //     · cliente `/dashboard/services/:id/audit`.
  // (En admin coinciden; en cliente NO — confundirlos hacía que el preview
  //  fetchara `/dashboard/...` inexistente → 404 → fail-soft → "sin eventos".)
  const apiPath = forceAdminRoute
    ? `/admin/services/${service.id}/audit`
    : `/services/${service.id}/audit`;
  const fullHref = forceAdminRoute
    ? `/admin/services/${service.id}/audit`
    : `/dashboard/services/${service.id}/audit`;
  const fullLink = (
    <Link href={fullHref} className={styles.auditFullLink}>
      {t('service.audit.view_full')} →
    </Link>
  );

  let page: ServiceTimelinePage | null = null;
  try {
    page = await serverFetch<ServiceTimelinePage>(apiPath);
  } catch {
    page = null;
  }

  if (!page || page.items.length === 0) {
    return (
      <SectionCard title={t('service.audit.recent_title')}>
        <p className={styles.cardTextMuted}>{t('service.audit.empty')}</p>
      </SectionCard>
    );
  }

  // Preview: primeras N entradas, sin "Cargar más" propio del timeline (lo
  // sustituye el enlace "Ver historial completo" al pie de la card).
  const previewItems = page.items.slice(0, AUDIT_PREVIEW_LIMIT);
  const previewPage: ServiceTimelinePage = {
    ...page,
    items: previewItems,
    next_cursor: null,
  };

  return (
    <SectionCard
      title={t('service.audit.recent_title')}
      actions={
        <span className={styles.auditCount}>
          {t('service.audit.recent_prefix')} {previewItems.length}
        </span>
      }
    >
      <ServiceAuditTimeline
        page={previewPage}
        isAdmin={forceAdminRoute}
        loadMoreHref={() => fullHref}
      />
      <div className={styles.auditFooter}>{fullLink}</div>
    </SectionCard>
  );
}

/** Card "¿Necesitas ayuda?" (aside, solo cliente). CTA a soporte. F.12.5. */
export function ClientHelpCardSection() {
  return (
    <SectionCard title={t('service.help.card_title')}>
      <p className={styles.helpBody}>{t('service.help.body')}</p>
      <div>
        <Link href="/dashboard/support" className={styles.ctaSecondary}>
          {t('service.help.cta')}
        </Link>
      </div>
    </SectionCard>
  );
}

/** Card placeholder Sprint 22 Projects. scope client. */
export function ClientDevCustomPlaceholderSection() {
  return (
    <SectionCard title={t('service.detail.dev_custom.title')}>
      <p className={styles.placeholderBody}>
        {t('service.detail.dev_custom.body')}
      </p>
    </SectionCard>
  );
}

/* ── Zona footer ── */

/** Footer "Última lectura del proveedor" (con icono de reloj, 1:1). scope both. */
export function FetchedAtFooterSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <p className={styles.footer}>
      <Clock size={14} strokeWidth={1.6} className={styles.footerIcon} />
      {t('service.detail.fetched_at')}{' '}
      {new Date(ctx.info.fetchedAt).toLocaleString('es-ES')}
    </p>
  );
}

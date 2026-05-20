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
import type { ReactNode } from 'react';

import { AlertBanner, Card } from '../../../components/ui';
import { t } from '../../i18n';
import type { ServiceDetailContext } from '../service-detail-context';
import { MetricsBar } from '../MetricsBar';
import { SslStatusCard } from '../SslStatusCard';
import { AppShortcutsCard } from '../AppShortcutsCard';
import { BillingCrossLinkCard } from '../BillingCrossLinkCard';
import styles from '../service-detail.module.css';

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Chrome compartido "Card con título + descripción + acción a la derecha"
 *  (Historial; reusable por futuras cards de navegación). */
function SectionLinkCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <Card>
      <div className={styles.splitRow}>
        <div>
          <h2 className={styles.sectionHeading}>{title}</h2>
          <p className={styles.sectionDesc}>{description}</p>
        </div>
        {action}
      </div>
    </Card>
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

/** MetricsBar — adapter. `isAdmin` = `forceAdminRoute` (chrome). */
export function MetricsBarSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <MetricsBar
      metrics={ctx.info.metrics ?? { fetchedAt: ctx.info.fetchedAt }}
      serviceId={ctx.service.id}
      isAdmin={ctx.forceAdminRoute}
      quotaAlertThresholdPct={ctx.service.quota_alert_threshold_pct}
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
    />
  );
}

/** Card "Historial de auditoría" (navegación a sub-página). scope both. */
export function ServiceAuditLinkCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service, forceAdminRoute } = ctx;
  return (
    <SectionLinkCard
      title={t('service.audit.title')}
      description={
        forceAdminRoute
          ? t('service.audit.subtitle_admin')
          : t('service.audit.subtitle_client')
      }
      action={
        <Link
          href={
            forceAdminRoute
              ? `/admin/services/${service.id}/audit`
              : `/dashboard/services/${service.id}/audit`
          }
          className={forceAdminRoute ? styles.ctaText : styles.ctaButton}
        >
          {t('service.audit.link')} →
        </Link>
      }
    />
  );
}

/** Card placeholder Sprint 22 Projects. scope client. */
export function ClientDevCustomPlaceholderSection() {
  return (
    <Card>
      <h2 className={styles.sectionHeading}>
        {t('service.detail.dev_custom.title')}
      </h2>
      <p className={styles.placeholderBody}>
        {t('service.detail.dev_custom.body')}
      </p>
    </Card>
  );
}

/* ── Zona footer ── */

/** Footer "Última lectura del proveedor". scope both. */
export function FetchedAtFooterSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <p className={styles.footer}>
      {t('service.detail.fetched_at')}{' '}
      {new Date(ctx.info.fetchedAt).toLocaleString('es-ES')}
    </p>
  );
}

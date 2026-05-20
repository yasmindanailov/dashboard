/**
 * service-detail-blocks — Sprint 15C.II Fase F.12 (layout canónico).
 *
 * Componentes de sección del registry BASE (`SERVICE_DETAIL_SECTIONS`) — los
 * que viven en `_shared/services/` (scope `both` + `client`). Cada uno recibe
 * el `ServiceDetailContext` completo y monta la sección correspondiente.
 *
 * F.12.3 (Amendment III): migrados a **DS + CSS module + i18n** (UI_SPEC §1.2
 * P5 voz de marca · §2.8 sin estilos inline). Los copys viven en
 * `service.detail.*` / `service.*` (translations-es.ts); los estilos en
 * `service-detail.module.css` (tokens). El comportamiento se preserva: los
 * bloques `both` con gating/copy divergente por ruta ramifican por
 * `ctx.forceAdminRoute` (NO por rol — Amendment I).
 *
 * Presentacional puro — Server-component compatible (sin `'use client'`).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AlertBanner, Card } from '../../../components/ui';
import { t } from '../../i18n';
import type { ServiceDetailContext } from '../service-detail-context';
import { ServiceHeader } from '../ServiceHeader';
import { MetricsBar } from '../MetricsBar';
import { SslStatusCard } from '../SslStatusCard';
import { AppShortcutsCard } from '../AppShortcutsCard';
import { BillingCrossLinkCard } from '../BillingCrossLinkCard';
import { ActionsBar } from '../ActionsBar';
import { SsoButton } from '../SsoButton';
import styles from '../service-detail.module.css';

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Chrome compartido "Card con título + descripción + acción a la derecha"
 *  (Panel del proveedor, DNS, Historial). DRY de los 3 bloques. */
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

/** Back-link de la página cliente. El admin tiene su propia fila con el
 *  ProviderHealthBadge — ver `_sections.tsx`. */
export function ClientBackLinkSection() {
  return (
    <Link href="/dashboard/services" className={styles.backLink}>
      ← {t('service.detail.back_client')}
    </Link>
  );
}

/** Header normalizado del servicio (Card + ServiceHeader). scope both.
 *  `isAdmin` = `forceAdminRoute` (chrome display-only — Amendment I). */
export function ServiceHeaderSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <Card>
      <ServiceHeader
        info={ctx.info}
        productName={ctx.service.product_name}
        isAdmin={ctx.forceAdminRoute}
      />
    </Card>
  );
}

/** Banner de servicio terminal (cancelled/terminated). scope both —
 *  variante `info` + copy cliente / `danger` + razón técnica admin. */
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

/** Card "Detalles del servicio" cliente — Plan/Estado/Contratado el.
 *  Siempre visible (garantía heredada Fase B fix-up). scope client. */
export function ClientServiceDetailsCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service } = ctx;
  return (
    <Card>
      <h2 className={styles.detailsHeading}>
        {t('service.detail.details.title')}
      </h2>
      <dl className={styles.detailsList}>
        {service.provisioner_slug && (
          <>
            <dt className={styles.detailsTerm}>
              {t('service.detail.details.plan')}
            </dt>
            <dd className={styles.detailsValue}>{service.product_name}</dd>
          </>
        )}
        <dt className={styles.detailsTerm}>
          {t('service.detail.details.status')}
        </dt>
        <dd className={styles.detailsValueStatus}>{service.status}</dd>
        <dt className={styles.detailsTerm}>
          {t('service.detail.details.created')}
        </dt>
        <dd className={styles.detailsValue}>
          {formatLongDate(service.created_at)}
        </dd>
      </dl>
    </Card>
  );
}

/** MetricsBar — adapter. `isAdmin` = `forceAdminRoute` (chrome — Amendment I). */
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

/** AppShortcutsCard — adapter compartido (apps-card-client base +
 *  apps-card-admin extensión). `isAdmin` = `ctx.isAdmin` (tooltip + acciones). */
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
 *  /admin o /dashboard billing según ruta — Amendment I). */
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

/** Card "Panel del proveedor" (SSO). scope both — copy cliente-amigable vs
 *  nota GDPR impersonation admin. `isAdmin` del SsoButton = `ctx.isAdmin`. */
export function SsoPanelCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  const { info, service, isAdmin, forceAdminRoute } = ctx;
  if (!info.capabilities.panel_label) return null;
  return (
    <SectionLinkCard
      title={t('service.detail.sso.title')}
      description={
        forceAdminRoute
          ? t('service.detail.sso.desc_admin')
          : t('service.detail.sso.desc_client')
      }
      action={
        <SsoButton
          serviceId={service.id}
          panelLabel={info.capabilities.panel_label}
          isAdmin={isAdmin}
        />
      }
    />
  );
}

/** ActionsBar — adapter. `isAdmin` = `ctx.isAdmin` (acciones admin-no-blacklisted). */
export function ActionsBarSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <ActionsBar
      serviceId={ctx.service.id}
      actions={ctx.info.availableActions}
      isAdmin={ctx.isAdmin}
    />
  );
}

/** Card "DNS". scope both — copy cliente-amigable vs admin-seco + link a
 *  /dashboard o /admin + estilo distinto. */
export function DnsLinkCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  const { service, forceAdminRoute } = ctx;
  return (
    <SectionLinkCard
      title={
        forceAdminRoute
          ? t('service.detail.dns.title_admin')
          : t('service.detail.dns.title_client')
      }
      description={
        forceAdminRoute
          ? t('service.detail.dns.desc_admin')
          : t('service.detail.dns.desc_client')
      }
      action={
        <Link
          href={
            forceAdminRoute
              ? `/admin/services/${service.id}/dns`
              : `/dashboard/services/${service.id}/dns`
          }
          className={forceAdminRoute ? styles.ctaText : styles.ctaButton}
        >
          {t('service.detail.dns.cta')} →
        </Link>
      }
    />
  );
}

/** Card "Historial de auditoría". scope both — subtitle cliente vs admin +
 *  link a /dashboard o /admin + estilo distinto. */
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

/** Footer "Última lectura del proveedor". scope both. */
export function FetchedAtFooterSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <p className={styles.footer}>
      {t('service.detail.fetched_at')}{' '}
      {new Date(ctx.info.fetchedAt).toLocaleString('es-ES')}
    </p>
  );
}

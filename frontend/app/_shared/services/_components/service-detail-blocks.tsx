/**
 * service-detail-blocks — Sprint 15C.II Fase F.12 (layout canónico).
 *
 * Componentes de sección del registry BASE (`SERVICE_DETAIL_SECTIONS`) — los
 * que viven en `_shared/services/` (scope `both` + `client`). Cada uno recibe
 * el `ServiceDetailContext` completo y monta la sección correspondiente.
 *
 * **Cero cambio funcional** (F.12.2): el JSX está portado literalmente de
 * `app/dashboard/services/[id]/page.tsx` y `app/admin/services/[id]/page.tsx`.
 * Los bloques `both` con gating o copy divergente por ruta ramifican por
 * `ctx.forceAdminRoute` (NO por rol — Amendment I) para preservar el
 * comportamiento exacto de ambas páginas.
 *
 * Componentes presentacionales puros — Server-component compatible (sin
 * `'use client'`). Los sub-componentes interactivos (SsoButton, ActionsBar)
 * son CC que ya gestionan su propia interactividad.
 */
import Link from 'next/link';

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

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Back-link de la página cliente (`← Mis servicios`). El admin tiene su
 *  propia fila con el ProviderHealthBadge — ver `_sections.tsx`. */
export function ClientBackLinkSection() {
  return (
    <Link
      href="/dashboard/services"
      style={{
        color: 'var(--text-secondary)',
        fontSize: 13,
        textDecoration: 'none',
      }}
    >
      ← Mis servicios
    </Link>
  );
}

/** Header normalizado del servicio (Card + ServiceHeader). scope both.
 *  `isAdmin` = `forceAdminRoute` (NO el rol): el page cliente previo pasaba
 *  `isAdmin={false}` hardcoded a ServiceHeader incluso para staff (un staff en
 *  la página cliente ve el mensaje de drift cliente-genérico). Cero cambio
 *  funcional. */
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            {t('service.terminal.cancelled.admin.body')}
          </p>
          {info.statusReason && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--text-secondary)',
              }}
            >
              {t(info.statusReason)}
            </p>
          )}
          {service.cancellation_reason && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-tertiary)',
              }}
            >
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
      <p style={{ margin: 0, fontSize: 13 }}>
        {t('service.terminal.cancelled.client.body')}
      </p>
      {service.cancelled_at && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          Cancelado el {formatLongDate(service.cancelled_at)}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          {t('service.suspended.client.body')}
        </p>
        <p style={{ margin: 0, fontSize: 13 }}>
          <strong>{t('service.suspended.client.reason_label')}:</strong>{' '}
          {t(`service.suspension_reason.${suspensionReasonCode}`)}
        </p>
        <div>
          {suspensionReasonCode === 'overdue_payment' ? (
            <Link
              href="/dashboard/billing"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'var(--brand-600)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              {t('service.suspended.client.cta_pay')}
            </Link>
          ) : (
            <Link
              href="/dashboard/support"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                textDecoration: 'none',
              }}
            >
              {t('service.suspended.client.cta_support')}
            </Link>
          )}
        </div>
        {service.suspended_at && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            Suspendido el {formatLongDate(service.suspended_at)}
          </p>
        )}
      </div>
    </AlertBanner>
  );
}

/** Card "Detalles del servicio" cliente — `<dl>` Plan/Estado/Contratado el.
 *  Siempre visible (garantía heredada Fase B fix-up). scope client. */
export function ClientServiceDetailsCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service } = ctx;
  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
        Detalles del servicio
      </h2>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '6px 16px',
          margin: 0,
          fontSize: 13,
        }}
      >
        {service.provisioner_slug && (
          <>
            <dt style={{ color: 'var(--text-secondary)' }}>Plan</dt>
            <dd style={{ margin: 0 }}>{service.product_name}</dd>
          </>
        )}
        <dt style={{ color: 'var(--text-secondary)' }}>Estado de tu servicio</dt>
        <dd style={{ margin: 0, textTransform: 'capitalize' }}>
          {service.status}
        </dd>
        <dt style={{ color: 'var(--text-secondary)' }}>Contratado el</dt>
        <dd style={{ margin: 0 }}>{formatLongDate(service.created_at)}</dd>
      </dl>
    </Card>
  );
}

/** MetricsBar — adapter ctx → props. scope both. `isAdmin` = `forceAdminRoute`
 *  (display-chrome: el page cliente previo pasaba `isAdmin={false}` hardcoded). */
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

/** SslStatusCard — adapter. scope both (admin gana tooltip ISO display-only).
 *  `isAdmin` = `forceAdminRoute` (el page cliente previo omitía el prop → default
 *  false, también para staff). */
export function SslStatusCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  if (!ctx.info.ssl) return null;
  return <SslStatusCard ssl={ctx.info.ssl} isAdmin={ctx.forceAdminRoute} />;
}

/** AppShortcutsCard — adapter compartido (lo usan apps-card-client en base y
 *  apps-card-admin en la extensión admin). */
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

/** BillingCrossLinkCard — adapter. scope both. `isAdmin` = `forceAdminRoute`:
 *  el link "Ver factura" apunta a `/admin/billing/[id]` (admin) o
 *  `/dashboard/billing/[id]` (cliente) según la RUTA, no el rol — el page
 *  cliente previo omitía el prop (default false) también para staff. */
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

/** Card "Panel del proveedor" (Card + texto + SsoButton). scope both —
 *  copy cliente-amigable vs nota GDPR impersonation admin. */
export function SsoPanelCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  const { info, service, isAdmin, forceAdminRoute } = ctx;
  if (!info.capabilities.panel_label) return null;
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Panel del proveedor
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {forceAdminRoute
              ? 'Abrir el panel del proveedor como admin se registra automáticamente como impersonation en el log GDPR del cliente afectado (`service.admin_sso_impersonation`, portal transparency).'
              : 'Accede al panel especializado para operaciones avanzadas (gestión de email, bases de datos, archivos…). La sesión se abre en una nueva pestaña con un token temporal y queda registrada en tu portal de transparencia.'}
          </p>
        </div>
        <SsoButton
          serviceId={service.id}
          panelLabel={info.capabilities.panel_label}
          isAdmin={isAdmin}
        />
      </div>
    </Card>
  );
}

/** ActionsBar — adapter. scope both. */
export function ActionsBarSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <ActionsBar
      serviceId={ctx.service.id}
      actions={ctx.info.availableActions}
      isAdmin={ctx.isAdmin}
    />
  );
}

/** Card "DNS" (Card + texto + link). scope both — copy cliente-amigable vs
 *  admin-seco + link a /dashboard o /admin + estilo distinto. */
export function DnsLinkCardSection({ ctx }: { ctx: ServiceDetailContext }) {
  const { service, forceAdminRoute } = ctx;
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            {forceAdminRoute ? 'Gestión DNS' : 'DNS de tu dominio'}
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {forceAdminRoute
              ? 'Revisa y edita los registros DNS de la zona de este servicio. Los cambios se aplican directamente en el proveedor.'
              : 'Crea, edita o elimina registros DNS (A, AAAA, CNAME, MX, TXT, SRV, CAA) de la zona autoritativa gestionada por Aelium. Los cambios pueden tardar minutos en propagarse.'}
          </p>
        </div>
        <Link
          href={
            forceAdminRoute
              ? `/admin/services/${service.id}/dns`
              : `/dashboard/services/${service.id}/dns`
          }
          style={
            forceAdminRoute
              ? {
                  color: 'var(--brand-600)',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }
              : {
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }
          }
        >
          Gestionar DNS →
        </Link>
      </div>
    </Card>
  );
}

/** Card "Historial de auditoría" (Card + texto + link). scope both — subtitle
 *  cliente vs admin + link a /dashboard o /admin + estilo distinto. */
export function ServiceAuditLinkCardSection({
  ctx,
}: {
  ctx: ServiceDetailContext;
}) {
  const { service, forceAdminRoute } = ctx;
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            {t('service.audit.title')}
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {forceAdminRoute
              ? t('service.audit.subtitle_admin')
              : t('service.audit.subtitle_client')}
          </p>
        </div>
        <Link
          href={
            forceAdminRoute
              ? `/admin/services/${service.id}/audit`
              : `/dashboard/services/${service.id}/audit`
          }
          style={
            forceAdminRoute
              ? {
                  color: 'var(--brand-600)',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }
              : {
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }
          }
        >
          {t('service.audit.link')} →
        </Link>
      </div>
    </Card>
  );
}

/** Card placeholder Sprint 22 Projects. scope client. */
export function ClientDevCustomPlaceholderSection() {
  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
        ¿Necesitas un desarrollo a medida?
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
        Próximamente podrás solicitar un desarrollo personalizado vinculado a
        este servicio. (Función disponible cuando Sprint 22 Projects esté
        activo.)
      </p>
    </Card>
  );
}

/** Footer "Última lectura del proveedor". scope both. */
export function FetchedAtFooterSection({ ctx }: { ctx: ServiceDetailContext }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
      Última lectura del proveedor:{' '}
      {new Date(ctx.info.fetchedAt).toLocaleString('es-ES')}
    </p>
  );
}

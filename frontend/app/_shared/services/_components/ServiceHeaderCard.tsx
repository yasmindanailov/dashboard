/**
 * ServiceHeaderCard — Sprint 15C.II Fase F.12.4 (layout canónico, Amendment IV).
 *
 * Contenido del headerCard del `<DetailPage>`: identidad (nombre + Badge de
 * estado) + **metadata inline** (Plan · Dominio · Contratado · Renueva — §3.1,
 * sustituye la card "Detalles del servicio") + **clúster de acciones**
 * (`<ServiceActionCluster>`, Regla D2). Resuelve aquí (SC) qué primaria /
 * secundaria / menú mostrar según rol×estado y pasa primitivos al clúster.
 *
 * Server-component compatible (el clúster es un CC island).
 */
import { Badge } from '../../../components/ui';
import { t } from '../../i18n';
import type { ServiceDetailContext } from '../service-detail-context';
import { filterQuickActions } from '../quick-actions';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE } from '../service-status';
import { ServiceActionCluster } from './ServiceActionCluster';
import styles from '../service-detail.module.css';

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function ServiceHeaderCard({ ctx }: { ctx: ServiceDetailContext }) {
  const {
    service,
    info,
    billingCrossLink,
    isAdmin,
    forceAdminRoute,
    isTerminal,
    isSuspended,
    isDrift,
  } = ctx;

  // Gating del clúster (Amendment IV D3): cliente exige !suspended && !drift;
  // admin solo !terminal (mantiene acceso operativo para diagnosticar).
  const operational =
    !isTerminal && (forceAdminRoute || (!isSuspended && !isDrift));

  const ssoPanelLabel =
    operational &&
    info.capabilities.hasSsoPanel &&
    info.capabilities.panel_label
      ? info.capabilities.panel_label
      : null;

  const dnsHref =
    operational && info.capabilities.has_dns_management
      ? forceAdminRoute
        ? `/admin/services/${service.id}/dns`
        : `/dashboard/services/${service.id}/dns`
      : null;

  // Acciones rápidas del menú ⋯: cliente !terminal && !suspended; admin
  // !terminal (replica el gating del antiguo ActionsBar).
  const showQuick = !isTerminal && (forceAdminRoute || !isSuspended);
  const quickActions = showQuick
    ? filterQuickActions(info.availableActions, isAdmin)
    : [];

  const metaParts: string[] = [];
  if (service.product_name) metaParts.push(service.product_name);
  if (service.domain) metaParts.push(service.domain);
  metaParts.push(
    `${t('service.detail.meta.contracted')} ${formatLongDate(service.created_at)}`,
  );
  if (billingCrossLink?.nextDueDate) {
    metaParts.push(
      `${t('service.detail.meta.renews')} ${formatLongDate(billingCrossLink.nextDueDate)}`,
    );
  }

  return (
    <div className={styles.headerCard}>
      <div className={styles.headerIdentity}>
        <div className={styles.headerTitleRow}>
          <h1 className={styles.headerTitle}>{info.display.primary}</h1>
          <Badge variant={SERVICE_STATUS_TONE[info.status]}>
            {SERVICE_STATUS_LABEL[info.status]}
          </Badge>
        </div>
        <p className={styles.headerMeta}>
          {metaParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className={styles.headerMetaSep}>· </span>}
              {part}
            </span>
          ))}
        </p>
        {/* Cliente con drift: mensaje empático (UI_SPEC §4.13 — el cliente no
            ve jerga técnica; el admin tiene el AdminDriftBanner). */}
        {!forceAdminRoute && isDrift && (
          <p className={styles.sectionDesc}>{t('service.drift.client_generic')}</p>
        )}
      </div>

      <ServiceActionCluster
        serviceId={service.id}
        ssoPanelLabel={ssoPanelLabel}
        dnsHref={dnsHref}
        quickActions={quickActions}
        isAdmin={isAdmin}
      />
    </div>
  );
}

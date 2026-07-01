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
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Box,
  Globe,
  Monitor,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import {
  Badge,
  DescriptionList,
  IconWell,
  type DescriptionItem,
} from '../../../components/ui';
import { t } from '../../i18n';
import type { ServiceDetailContext } from '../service-detail-context';
import { filterQuickActions } from '../quick-actions';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE } from '../service-status';
import { ServiceActionsMenu } from '../ServiceActionsMenu';
import { ServiceActionCluster } from './ServiceActionCluster';
import styles from '../service-detail.module.css';

/** Icono del icon-well del header por tipo de producto (1:1 con el mockup). */
const TYPE_ICON: Record<string, LucideIcon> = {
  hosting_web: Monitor,
  domain: Globe,
  docker_service: Server,
  support_inside: ShieldCheck,
};

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

interface ServiceHeaderCardProps {
  ctx: ServiceDetailContext;
  /**
   * Menú "Más acciones" (⋯) inyectado por la ruta admin
   * (`<AdminServiceActionsMenu>`). Si se omite (cliente), el header monta el
   * `<ServiceActionsMenu>` por defecto con las quick-actions del plugin.
   */
  actionsMenu?: ReactNode;
}

export function ServiceHeaderCard({ ctx, actionsMenu }: ServiceHeaderCardProps) {
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

  // Metadata inline (§3.1) sobre la primitiva DS `<DescriptionList>`:
  // admin "Plan · Cliente · Contratado · Renueva"; cliente "Plan · Dominio · …".
  const metaItems: DescriptionItem[] = [];
  if (service.product_name) {
    metaItems.push({
      key: 'plan',
      term: t('service.overview.plan'),
      value: service.product_name,
    });
  }
  if (forceAdminRoute) {
    // El nombre del cliente es la info primaria admin (link al detalle).
    metaItems.push({
      key: 'client',
      term: t('service.detail.meta.client'),
      value: (
        <Link
          href={`/admin/clients/${service.user_id}`}
          className={styles.metaLink}
        >
          {service.client_name}
        </Link>
      ),
    });
  } else if (service.domain) {
    metaItems.push({ key: 'domain', value: service.domain });
  }
  metaItems.push({
    key: 'contracted',
    term: t('service.detail.meta.contracted'),
    value: formatLongDate(service.created_at),
  });
  // "Renueva" NO en servicios terminales (cancelado/terminado no renueva —
  // Amendment VIII, coherencia).
  if (billingCrossLink?.nextDueDate && !isTerminal) {
    metaItems.push({
      key: 'renews',
      term: t('service.detail.meta.renews'),
      value: formatLongDate(billingCrossLink.nextDueDate),
    });
  }

  const Icon = TYPE_ICON[service.product_type] ?? Box;
  const isSupportInside = service.product_type === 'support_inside';

  return (
    <div className={styles.headerCard}>
      <div className={styles.headerLead}>
        <IconWell icon={Icon} tone="brand" size="xl" filled={isSupportInside} />
        <div className={styles.headerIdentity}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.headerTitle}>{info.display.primary}</h1>
            <Badge variant={SERVICE_STATUS_TONE[info.status]}>
              {SERVICE_STATUS_LABEL[info.status]}
            </Badge>
            {ctx.siCoverageBadge && (
              <Badge variant="brand">{ctx.siCoverageBadge}</Badge>
            )}
          </div>
          <DescriptionList layout="inline" items={metaItems} />
          {/* Cliente con drift: mensaje empático (UI_SPEC §4.13 — el cliente no
              ve jerga técnica; el admin tiene el AdminDriftBanner). */}
          {!forceAdminRoute && isDrift && (
            <p className={styles.sectionDesc}>
              {t('service.drift.client_generic')}
            </p>
          )}
        </div>
      </div>

      <ServiceActionCluster
        serviceId={service.id}
        ssoPanelLabel={ssoPanelLabel}
        dnsHref={dnsHref}
        isAdmin={isAdmin}
        menu={
          actionsMenu ?? (
            <ServiceActionsMenu
              serviceId={service.id}
              isAdmin={isAdmin}
              quickActions={quickActions}
            />
          )
        }
      />
    </div>
  );
}

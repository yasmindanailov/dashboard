/**
 * ServiceDetailLayout — Sprint 15C.II Fase F.12 (layout canónico, R2+R3 frozen).
 *
 * Compositor (SC) del detalle de servicio, compartido por
 * `/dashboard/services/[id]` y `/admin/services/[id]`. Construye breadcrumb +
 * headerCard (`<ServiceHeaderCard>`) + zona banner + paneles de tab (grid
 * 2-col) + footer, y delega el chrome + estado de tab al DS `<DetailPage>` vía
 * el CC `<ServiceDetailView>`.
 *
 * F.12.4 (Amendment IV): adopta `<DetailPage>`; identidad+metadata+acciones en
 * el headerCard; banners en zona propia siempre visible; tabs Resumen/Gestión/
 * Actividad con grid 2-col de Cards (no apilado). Provisioner-agnóstico: las
 * secciones se gatean por capability (`matchesScope` + `shouldRender`); una tab
 * vacía se oculta; con una sola tab, sin barra de tabs.
 *
 * Server-component compatible: descriptores puros; interactividad en CCs.
 */
import type { ReactNode } from 'react';

import { t } from '../i18n';
import type { BreadcrumbItem } from '../../components/ui';
import type {
  SectionDescriptor,
  SectionGroup,
  ServiceDetailContext,
} from './service-detail-context';
import { matchesScope } from './service-detail-context';
import { SERVICE_DETAIL_SECTIONS } from './service-detail-sections';
import { ServiceDetailView } from './ServiceDetailView';
import { ServiceHeaderCard } from './_components/ServiceHeaderCard';
import styles from './service-detail.module.css';

interface ServiceDetailLayoutProps {
  ctx: ServiceDetailContext;
  /** Tab inicial (de `?tab=`). Default `summary`. */
  activeTab?: string;
  /** Descriptores admin concatenados al registry base (R3 regla 6). */
  extraSections?: readonly SectionDescriptor[];
}

const TAB_ORDER: {
  id: Extract<SectionGroup, 'summary' | 'management' | 'activity'>;
  labelKey: string;
}[] = [
  { id: 'summary', labelKey: 'service.detail.tab.summary' },
  { id: 'management', labelKey: 'service.detail.tab.management' },
  { id: 'activity', labelKey: 'service.detail.tab.activity' },
];

export function ServiceDetailLayout({
  ctx,
  activeTab = 'summary',
  extraSections = [],
}: ServiceDetailLayoutProps) {
  const visible = [...SERVICE_DETAIL_SECTIONS, ...extraSections].filter(
    (section) => matchesScope(section.scope, ctx) && section.shouldRender(ctx),
  );

  const inGroup = (group: SectionGroup): SectionDescriptor[] =>
    visible
      .filter((section) => section.group === group)
      .sort((a, b) => b.priority - a.priority);

  const render = (sections: SectionDescriptor[]): ReactNode =>
    sections.map((section) => {
      const SectionComponent = section.component;
      return <SectionComponent key={section.id} ctx={ctx} />;
    });

  const breadcrumb: BreadcrumbItem[] = [
    {
      label: ctx.forceAdminRoute
        ? t('service.detail.back_admin')
        : t('service.detail.back_client'),
      href: ctx.forceAdminRoute ? '/admin/services' : '/dashboard/services',
    },
    { label: ctx.info.display.primary },
  ];

  const bannerSections = inGroup('banner');
  const banners =
    bannerSections.length > 0 ? (
      <div className={styles.bannersZone}>{render(bannerSections)}</div>
    ) : null;

  const footerSections = inGroup('footer');
  const footer = footerSections.length > 0 ? render(footerSections) : null;

  const tabDefs = TAB_ORDER.map((tabDef) => ({
    key: tabDef.id,
    label: t(tabDef.labelKey),
    sections: inGroup(tabDef.id),
  })).filter((tabDef) => tabDef.sections.length > 0);

  const tabs = tabDefs.map((tabDef) => ({ key: tabDef.key, label: tabDef.label }));
  const panels = tabDefs.map((tabDef) => ({
    key: tabDef.key,
    node: <div className={styles.tabGrid}>{render(tabDef.sections)}</div>,
  }));

  return (
    <ServiceDetailView
      breadcrumb={breadcrumb}
      wide
      header={<ServiceHeaderCard ctx={ctx} />}
      banners={banners}
      footer={footer}
      tabs={tabs}
      panels={panels}
      initialTab={activeTab}
    />
  );
}

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
 * F.12.5 (Amendment V/VI — densidad profesional): la tab "Resumen" se compone en
 * layout **main + aside** (2fr/1fr; recursos/SSL/apps en MAIN, facturación/datos
 * técnicos/ayuda en ASIDE) — `column` por descriptor. Si una columna queda
 * vacía, la otra fluye a ancho completo (servicio mínimo, terminal). El resto de
 * tabs sigue en grid 2-col con soporte de `fullWidth` (ej. `<DangerZone>` al
 * fondo de "Gestión"). Colapsa a 1 columna en <900px.
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
  /**
   * Menú "Más acciones" (⋯) del header inyectado por la ruta admin
   * (`<AdminServiceActionsMenu>`). El cliente lo omite → el header monta el
   * menú por defecto con las quick-actions del plugin. (F.12.5, Amendment VII.)
   */
  headerActionsMenu?: ReactNode;
}

const TAB_ORDER: {
  id: Extract<SectionGroup, 'summary' | 'notes' | 'audit'>;
  labelKey: string;
}[] = [
  { id: 'summary', labelKey: 'service.detail.tab.summary' },
  { id: 'notes', labelKey: 'service.detail.tab.notes' },
  { id: 'audit', labelKey: 'service.detail.tab.audit' },
];

export function ServiceDetailLayout({
  ctx,
  activeTab = 'summary',
  extraSections = [],
  headerActionsMenu,
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

  // Grid items para tabs no-summary: cada sección es un item; las marcadas
  // `fullWidth` ocupan toda la fila (ej. `<DangerZone>` al fondo de "Gestión").
  const renderGridItems = (sections: SectionDescriptor[]): ReactNode =>
    sections.map((section) => {
      const SectionComponent = section.component;
      return (
        <div
          key={section.id}
          className={section.fullWidth ? styles.tabGridFull : undefined}
        >
          <SectionComponent ctx={ctx} />
        </div>
      );
    });

  // Panel de una tab: "Resumen" usa layout main+aside (overview, F.12.5); el
  // resto, grid 2-col con soporte de `fullWidth`. Robustez frozen: si una
  // columna de "Resumen" queda vacía, la otra fluye a ancho completo.
  const renderTabPanel = (
    group: SectionGroup,
    sections: SectionDescriptor[],
  ): ReactNode => {
    if (group !== 'summary') {
      return <div className={styles.tabGrid}>{renderGridItems(sections)}</div>;
    }
    const mainSections = sections.filter(
      (section) => (section.column ?? 'main') === 'main',
    );
    const asideSections = sections.filter(
      (section) => section.column === 'aside',
    );
    if (mainSections.length === 0) {
      return <div className={styles.summarySingle}>{render(asideSections)}</div>;
    }
    if (asideSections.length === 0) {
      return <div className={styles.summarySingle}>{render(mainSections)}</div>;
    }
    return (
      <div className={styles.summaryGrid}>
        <div className={styles.summaryMain}>{render(mainSections)}</div>
        <aside className={styles.summaryAside}>{render(asideSections)}</aside>
      </div>
    );
  };

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
    node: renderTabPanel(tabDef.key, tabDef.sections),
  }));

  return (
    <ServiceDetailView
      breadcrumb={breadcrumb}
      wide
      header={<ServiceHeaderCard ctx={ctx} actionsMenu={headerActionsMenu} />}
      banners={banners}
      footer={footer}
      tabs={tabs}
      panels={panels}
      initialTab={activeTab}
    />
  );
}

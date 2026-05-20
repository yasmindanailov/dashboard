/**
 * ServiceDetailLayout — Sprint 15C.II Fase F.12 (layout canónico, R2+R3 frozen).
 *
 * Plantilla ÚNICA del detalle de servicio, compartida por
 * `/dashboard/services/[id]` (cliente) y `/admin/services/[id]` (admin). Las
 * páginas son wrappers finos que componen el `ServiceDetailContext` y delegan
 * aquí (ADR-070 · UI_SPEC §1.2 P6).
 *
 * F.12.3 (Amendment III): el frame se organiza en **zonas + tabs adaptativas**
 * (UI_SPEC §2.5). Itera el registry declarativo (base `SERVICE_DETAIL_SECTIONS`
 * + `extraSections` admin), filtra por `matchesScope` + `shouldRender(ctx)`,
 * ordena por `priority` desc, y agrupa por `group`:
 *   - `header` / `footer` → siempre visibles (fuera de tabs).
 *   - `summary` / `management` / `activity` → tabs. Una tab vacía se oculta; si
 *     solo sobrevive una tab, se renderiza sin tabs (§2.5 — provisioner-agnóstico:
 *     un servicio mínimo colapsa con elegancia).
 *
 * Server-component compatible: los descriptores son datos puros; la conmutación
 * de tabs vive en el CC `<ServiceDetailTabs>` (reusa el DS `<Tabs>`).
 */
import type { ReactNode } from 'react';

import { t } from '../i18n';
import type {
  SectionDescriptor,
  SectionGroup,
  ServiceDetailContext,
} from './service-detail-context';
import { matchesScope } from './service-detail-context';
import { SERVICE_DETAIL_SECTIONS } from './service-detail-sections';
import { ServiceDetailTabs } from './ServiceDetailTabs';
import styles from './service-detail.module.css';

interface ServiceDetailLayoutProps {
  ctx: ServiceDetailContext;
  /** Tab inicial (de `?tab=`). Default `summary`. Si es inválida cae a la 1ª. */
  activeTab?: string;
  /** Descriptores admin concatenados al registry base (R3 regla 6 · Amendment I). */
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

  const tabs = TAB_ORDER.map((tabDef) => ({
    id: tabDef.id,
    label: t(tabDef.labelKey),
    sections: inGroup(tabDef.id),
  })).filter((tab) => tab.sections.length > 0);

  return (
    <div className={styles.layout}>
      {render(inGroup('header'))}

      {tabs.length > 1 ? (
        <ServiceDetailTabs
          tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
          initialTab={activeTab}
          panels={tabs.map((tab) => ({
            id: tab.id,
            node: <div className={styles.tabPanel}>{render(tab.sections)}</div>,
          }))}
        />
      ) : tabs.length === 1 ? (
        <div className={styles.tabPanel}>{render(tabs[0].sections)}</div>
      ) : null}

      {render(inGroup('footer'))}
    </div>
  );
}

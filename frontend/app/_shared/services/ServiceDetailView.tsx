'use client';

/**
 * ServiceDetailView — Sprint 15C.II Fase F.12.4 (layout canónico, Amendment IV).
 *
 * Wrapper cliente que monta el DS `<DetailPage>` (breadcrumb + headerCard +
 * tabBar canónicos, como clientes/productos) y mantiene el estado de la tab
 * (patrón `ClientDetailView`). Recibe header/banners/footer/paneles ya
 * renderizados en servidor (`ReactNode`, incl. async Server Components) y
 * conmuta el panel activo sin re-fetch — el wrapper SC ya cargó todos los
 * datos en el `ServiceDetailContext`.
 *
 * Estructura renderada: breadcrumb → headerCard (identidad+metadata+acciones)
 * → tabBar → [banners siempre visibles] → panel activo → [footer siempre
 * visible]. `initialTab` viene de `?tab=` (deep-link); si es inválida cae a la
 * primera tab disponible. Sin tabs si solo hay una (§2.5).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';

import { DetailPage } from '../../components/ui';
import type { BreadcrumbItem, DetailTab } from '../../components/ui';

interface ServiceDetailViewProps {
  breadcrumb: BreadcrumbItem[];
  header: ReactNode;
  banners: ReactNode;
  footer: ReactNode;
  tabs: DetailTab[];
  panels: { key: string; node: ReactNode }[];
  initialTab: string;
  wide?: boolean;
}

export function ServiceDetailView({
  breadcrumb,
  header,
  banners,
  footer,
  tabs,
  panels,
  initialTab,
  wide,
}: ServiceDetailViewProps) {
  const valid = tabs.some((tab) => tab.key === initialTab)
    ? initialTab
    : (tabs[0]?.key ?? '');
  const [active, setActive] = useState(valid);
  const activePanel = panels.find((panel) => panel.key === active)?.node ?? null;

  return (
    <DetailPage
      breadcrumb={breadcrumb}
      header={header}
      tabs={tabs.length > 1 ? tabs : undefined}
      activeTab={active}
      onTabChange={setActive}
      wide={wide}
    >
      {banners}
      {activePanel}
      {footer}
    </DetailPage>
  );
}

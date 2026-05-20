'use client';

/**
 * ServiceDetailTabs — Sprint 15C.II Fase F.12.3 (layout canónico, tabs adaptativas).
 *
 * Client Component que conmuta entre las tabs del detalle de servicio reusando
 * el DS `<Tabs>` (mismo patrón que `ClientDetailView`). Recibe los paneles ya
 * renderizados en servidor (`ReactNode`, incluidos async Server Components como
 * `ServiceNotesCard`) y muestra el activo sin re-fetch — el wrapper SC ya
 * cargó todos los datos en el `ServiceDetailContext`.
 *
 * El layout solo monta este componente cuando hay ≥2 tabs no vacías; con una
 * sola tab renderiza su contenido directamente (§2.5). `initialTab` viene de
 * `?tab=` (deep-link, igual que el detalle de cliente); si es inválido cae a la
 * primera tab disponible.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Tabs } from '../../components/ui';

interface ServiceDetailTabsProps {
  tabs: { id: string; label: string }[];
  initialTab: string;
  panels: { id: string; node: ReactNode }[];
}

export function ServiceDetailTabs({
  tabs,
  initialTab,
  panels,
}: ServiceDetailTabsProps) {
  const valid = tabs.some((tab) => tab.id === initialTab)
    ? initialTab
    : (tabs[0]?.id ?? '');
  const [active, setActive] = useState(valid);
  const activePanel = panels.find((panel) => panel.id === active)?.node ?? null;

  return (
    <>
      <Tabs tabs={tabs} activeTab={active} onChange={setActive} />
      {activePanel}
    </>
  );
}

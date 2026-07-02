'use client';

/**
 * ServicesHubView — Sprint F4·W3·U04.
 *
 * Isla cliente del hub "Mis servicios": monta el filtro por tipo (ChipGroup
 * multi-selección) y renderiza los grupos según lo seleccionado. Recibe los
 * datos de card ya calculados por el SC (`page.tsx`) — serializables, sin
 * funciones. El filtro solo aparece si hay más de un tipo presente.
 */
import { useState } from 'react';

import { ChipGroup, EmptyState, type ChipOption } from '../../../components/ui';
import ServiceHubCard from './ServiceHubCard';
import ServiceHubGroup from './ServiceHubGroup';
import type { ServiceCardData, ServiceHubKind } from './service-hub-vm';
import styles from './services-hub.module.css';

interface HubGroup {
  key: ServiceHubKind;
  title: string;
  columns: 1 | 2;
  cards: ServiceCardData[];
}

interface Props {
  serviceCards: ServiceCardData[];
  domainCards: ServiceCardData[];
  siCards: ServiceCardData[];
}

export default function ServicesHubView({
  serviceCards,
  domainCards,
  siCards,
}: Props) {
  const groups: HubGroup[] = [
    { key: 'service', title: 'Webs y hosting', columns: 2, cards: serviceCards },
    { key: 'domain', title: 'Dominios', columns: 1, cards: domainCards },
    { key: 'support_inside', title: 'Soporte y planes', columns: 1, cards: siCards },
  ].filter((g) => g.cards.length > 0) as HubGroup[];

  // Multi-selección: por defecto todos los tipos presentes seleccionados; cada
  // chip muestra/oculta su grupo. Sin ninguno → empty state.
  const allKeys = groups.map((g) => g.key);
  const [selected, setSelected] = useState<string[]>(allKeys);

  const showFilter = groups.length > 1;
  const chipOptions: ChipOption[] = groups.map((g) => ({
    value: g.key,
    label: `${g.title} (${g.cards.length})`,
  }));

  const visible = groups.filter((g) => selected.includes(g.key));

  return (
    <>
      {showFilter && (
        <ChipGroup
          multiple
          options={chipOptions}
          value={selected}
          onChange={setSelected}
          aria-label="Filtrar servicios por tipo"
          className={styles.filter}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Nada seleccionado"
          description="Elige al menos un tipo de servicio para verlo."
        />
      ) : (
        <div className={styles.groups}>
          {visible.map((g) => (
            <ServiceHubGroup
              key={g.key}
              title={g.title}
              count={g.cards.length}
              columns={g.columns}
            >
              {g.cards.map((c) => (
                <ServiceHubCard key={c.id} {...c} />
              ))}
            </ServiceHubGroup>
          ))}
        </div>
      )}
    </>
  );
}

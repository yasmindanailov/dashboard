/**
 * /dashboard/services — "Mis servicios" (hub unificado) — F4·W3·U04.
 *
 * Server Component nativo (Modelo A, ADR-078 A1): el `dashboard/layout.tsx`
 * garantiza sesión; aquí cargamos server-side, en paralelo, las tres familias
 * que el cliente tiene con Aelium y las presentamos agrupadas con cards ficha
 * (`Servicios Cards Spec` Variante A, que supersede a `MisServicios.dc.html`):
 *   · Webs y hosting  → `GET /services` (exclude_type=domain)
 *   · Dominios        → `GET /domains`  (viven aquí; "Dominios" salió del nav F2)
 *   · Soporte y planes→ `GET /dashboard/support-inside/status`
 *
 * Doctrina de la lista (UI_SPEC §2.4): identidad + estado en lenguaje claro, sin
 * gauges (viven en el detalle), 1 sola primaria ("Contratar servicio"),
 * quick-actions en el menú ⋯. Cada fetch degrada de forma independiente
 * (`allSettled`): si Support Inside falla, hosting/dominios se siguen mostrando.
 */
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button, EmptyState, ListPage, StatusDot } from '../../components/ui';
import { serverFetch } from '../../lib/server-auth';
import type {
  ServiceListResponse,
  SupportInsideSubscriptionPayload,
} from '../../lib/api';
import type { ListDomainsResponse } from '../../_shared/domains/types';
import ServiceHubCard from './_components/ServiceHubCard';
import ServiceHubGroup from './_components/ServiceHubGroup';
import {
  aggregateHealth,
  domainCardData,
  serviceCardData,
  supportInsideCardData,
} from './_components/service-hub-vm';
import styles from './_components/services-hub.module.css';

export default async function ClientServicesPage() {
  // Los tres orígenes en paralelo; cada uno degrada por separado (allSettled).
  // `limit=100` = tope del DTO; un cliente real tiene pocos servicios → el hub
  // no pagina (presentación agrupada). Truncado >100 = borde no esperado.
  const [servicesRes, domainsRes, siRes] = await Promise.allSettled([
    serverFetch<ServiceListResponse>('/services?limit=100&exclude_type=domain'),
    serverFetch<ListDomainsResponse>('/domains?limit=100'),
    serverFetch<SupportInsideSubscriptionPayload | null>(
      '/dashboard/support-inside/status',
    ),
  ]);

  const services = servicesRes.status === 'fulfilled' ? servicesRes.value.data : [];
  const domains = domainsRes.status === 'fulfilled' ? domainsRes.value.data : [];
  const si = siRes.status === 'fulfilled' ? siRes.value : null;
  const loadFailed =
    servicesRes.status === 'rejected' && domainsRes.status === 'rejected';

  const serviceCards = services.map(serviceCardData);
  const domainCards = domains.map(domainCardData);
  const siCards =
    si && si.status !== 'cancelled' ? [supportInsideCardData(si)] : [];
  const allCards = [...serviceCards, ...domainCards, ...siCards];
  const totalCount = allCards.length;
  const health = aggregateHealth(allCards);

  return (
    <ListPage
      title="Mis servicios"
      subtitle="Todo lo que tienes con Aelium, en un sitio."
      action={
        <Link href="/dashboard/store">
          <Button leftIcon={<Plus size={16} />}>Contratar servicio</Button>
        </Link>
      }
      banner={
        totalCount > 0 ? (
          <div
            className={styles.health}
            data-tone={health === 'ok' ? 'success' : 'warning'}
          >
            <StatusDot color={health === 'ok' ? 'success' : 'warning'} pulse />
            <span>
              <strong className={styles.healthStrong}>
                {health === 'ok'
                  ? 'Todo funciona'
                  : 'Hay algo que requiere tu atención'}
              </strong>
              {health === 'ok'
                ? ' — sin incidencias en tus servicios.'
                : ' — revisa los avisos de abajo.'}
            </span>
          </div>
        ) : undefined
      }
    >
      {loadFailed ? (
        <EmptyState
          title="No se pudieron cargar tus servicios"
          description="Inténtalo de nuevo en unos segundos."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="Aún no tienes servicios"
          description="Cuando contrates un servicio o registres un dominio aparecerá aquí, con su estado y opciones de gestión."
          action={
            <Link href="/dashboard/store">
              <Button variant="secondary">Ir a la Tienda</Button>
            </Link>
          }
        />
      ) : (
        <div className={styles.groups}>
          {serviceCards.length > 0 && (
            <ServiceHubGroup
              title="Webs y hosting"
              count={serviceCards.length}
              columns={2}
            >
              {serviceCards.map((c) => (
                <ServiceHubCard key={c.id} {...c} />
              ))}
            </ServiceHubGroup>
          )}
          {domainCards.length > 0 && (
            <ServiceHubGroup title="Dominios" count={domainCards.length}>
              {domainCards.map((c) => (
                <ServiceHubCard key={c.id} {...c} />
              ))}
            </ServiceHubGroup>
          )}
          {siCards.length > 0 && (
            <ServiceHubGroup title="Soporte y planes" count={siCards.length}>
              {siCards.map((c) => (
                <ServiceHubCard key={c.id} {...c} />
              ))}
            </ServiceHubGroup>
          )}
        </div>
      )}
    </ListPage>
  );
}

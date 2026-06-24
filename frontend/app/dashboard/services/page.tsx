/**
 * /dashboard/services — Sprint 13 §13.AUTH Fase E (Modelo A).
 *
 * Server Component nativo: el `dashboard/layout.tsx` (SC) garantiza
 * sesión; aquí cargamos el listado server-side via `serverFetch`.
 * Cero useEffect+fetch+setState. ADR-078 Amendment A1.
 *
 * Sprint 11 Fase 11.D (ADR-070 + ADR-077): los clientes ven aquí los
 * servicios contratados. Cada fila enlaza al detalle resuelto por el
 * orquestador con el plugin del producto.
 */

import { ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { ServiceListItem, ServiceListResponse } from '../../lib/api';
import ServicesListView from './_components/ServicesListView';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function ClientServicesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);

  let services: ServiceListItem[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 1 };
  let errorMessage: string | null = null;
  try {
    // Sprint 15D Fase 15D.F.4 — los dominios viven en su propia vista
    // (/dashboard/domains); aquí se excluyen para no duplicarlos.
    const res = await serverFetch<ServiceListResponse>(
      `/services?page=${page}&limit=20&exclude_type=domain`,
    );
    services = res.data;
    meta = res.meta;
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar tus servicios';
  }

  return (
    <ListPage
      title="Mis servicios"
      subtitle={
        meta.total === 0
          ? 'Aquí aparecerán los servicios que contrates'
          : `${meta.total} servicio${meta.total === 1 ? '' : 's'} contratado${
              meta.total === 1 ? '' : 's'
            }`
      }
    >
      <ServicesListView
        services={services}
        meta={meta}
        errorMessage={errorMessage}
      />
    </ListPage>
  );
}

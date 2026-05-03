/**
 * /admin/services — Sprint 13 §13.AUTH Fase E (Modelo A).
 *
 * Server Component nativo. Filtros + paginación viajan por
 * searchParams; la lista la renderiza un CC `AdminServicesView`
 * (porque `Table` recibe render functions no serializables desde SC).
 * Cero useEffect+fetch+setState. ADR-078 Amendment A1.
 */

import { ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { ServiceListItem, ServiceListResponse } from '../../lib/api';
import AdminServicesView from './_components/AdminServicesView';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function AdminServicesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);
  const search = singleParam(params.search);
  const status = singleParam(params.status);
  const plugin = singleParam(params.plugin);

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '20');
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (plugin) query.set('provisioner_slug', plugin);

  let services: ServiceListItem[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 1 };
  let errorMessage: string | null = null;
  try {
    const res = await serverFetch<ServiceListResponse>(
      `/admin/services?${query.toString()}`,
    );
    services = res.data;
    meta = res.meta;
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar los servicios';
  }

  return (
    <ListPage
      title="Servicios"
      subtitle={`${meta.total} servicio${meta.total === 1 ? '' : 's'} en plataforma`}
    >
      <AdminServicesView
        services={services}
        meta={meta}
        errorMessage={errorMessage}
        initialFilters={{ search, status, plugin }}
      />
    </ListPage>
  );
}

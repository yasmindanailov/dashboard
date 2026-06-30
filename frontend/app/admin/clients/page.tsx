/**
 * /admin/clients — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Lista paginada + filtros via searchParams.
 * Detalle del cliente vive en /admin/clients/[id] (mutaciones, Batch 4).
 * ADR-078 Amendment A1.
 */

import { ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { SupportInsideEligibleTechnician } from '../../lib/api';
import ClientsListView from './_components/ClientsListView';
import ClientsHeaderActions from './_components/ClientsHeaderActions';

interface Client {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  client_profile: {
    client_type: string;
    phone: string | null;
    company_name: string | null;
  } | null;
  // F3·E8 — técnico asignado (si el cliente tiene SI activo). null si no.
  support_inside_subscription: {
    status: string;
    technician: { first_name: string; last_name: string } | null;
  } | null;
}
interface PaginatedResponse {
  data: Client[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);
  const search = singleParam(params.search);
  const status = singleParam(params.status);
  // F4·U21 — filtro "Tipo" (individual/company del perfil fiscal).
  const type = singleParam(params.client_type);
  // F3·E8 — filtro "Mis clientes" / por técnico ('me' o un UUID de agente).
  const assignedTechnician = singleParam(params.assigned_technician);

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '20');
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (type) query.set('client_type', type);
  if (assignedTechnician) query.set('assigned_technician', assignedTechnician);

  let clients: Client[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 0 };
  try {
    const res = await serverFetch<PaginatedResponse>(
      `/admin/clients?${query.toString()}`,
    );
    clients = res.data;
    meta = res.meta;
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  // F3·E8 — técnicos para el selector "por técnico". Fail-soft: requiere
  // Manage.SupportInside; roles sin permiso (agent_support/agent_billing) ven
  // solo "Todos" + "Mis clientes".
  let technicians: { value: string; label: string }[] = [];
  try {
    const techs = await serverFetch<SupportInsideEligibleTechnician[]>(
      '/admin/support-inside/technicians/eligible',
    );
    technicians = techs.map((t) => ({ value: t.id, label: t.full_name }));
  } catch {
    technicians = [];
  }

  return (
    <ListPage
      title="Clientes"
      subtitle={`${meta.total} cliente${meta.total !== 1 ? 's' : ''} registrado${meta.total !== 1 ? 's' : ''}`}
      action={<ClientsHeaderActions />}
    >
      <ClientsListView
        clients={clients}
        meta={meta}
        initialFilters={{ search, status, type, assignedTechnician }}
        technicians={technicians}
      />
    </ListPage>
  );
}

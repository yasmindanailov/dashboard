'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Avatar,
  Badge,
  BulkActionBar,
  Button,
  FilterBar,
  Pagination,
  SearchInput,
  Select,
  Table,
  useToast,
} from '../../../components/ui';
import type { BadgeVariant, TableColumn } from '../../../components/ui';

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
  support_inside_subscription: {
    status: string;
    technician: { first_name: string; last_name: string } | null;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  pending_verification: { label: 'Pendiente', variant: 'warning' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
  inactive: { label: 'Inactivo', variant: 'neutral' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label })),
];

// F4·U21 — filtro "Tipo" del mockup (enum ClientType: individual/company).
const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'individual', label: 'Particular' },
  { value: 'company', label: 'Empresa' },
];

const UsersIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

interface Props {
  clients: Client[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  initialFilters: {
    search: string;
    status: string;
    type: string;
    assignedTechnician: string;
  };
  /** Técnicos elegibles para el filtro "por técnico" (vacío si sin permiso). */
  technicians: { value: string; label: string }[];
}

export default function ClientsListView({
  clients,
  meta,
  initialFilters,
  technicians,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const [search, setSearch] = useState(initialFilters.search);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  function pushFilters(next: {
    search?: string;
    status?: string;
    client_type?: string;
    assigned_technician?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const writeOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    };
    if (next.search !== undefined) writeOrDelete('search', next.search);
    if (next.status !== undefined) writeOrDelete('status', next.status);
    if (next.client_type !== undefined)
      writeOrDelete('client_type', next.client_type);
    if (next.assigned_technician !== undefined)
      writeOrDelete('assigned_technician', next.assigned_technician);
    params.delete('page');
    startTransition(() => router.push(`/admin/clients?${params.toString()}`));
  }

  const technicianOptions = [
    { value: '', label: 'Técnico: todos' },
    { value: 'me', label: 'Mis clientes' },
    ...technicians,
  ];

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`/admin/clients?${params.toString()}`));
  }

  const columns: TableColumn<Client>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar name={`${c.first_name} ${c.last_name}`} size="md" tone="soft" />
          <div>
            <div style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>
              {c.first_name} {c.last_name}
            </div>
            {c.client_profile?.company_name && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                {c.client_profile.company_name}
              </div>
            )}
            {c.support_inside_subscription?.technician && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                Técnico: {c.support_inside_subscription.technician.first_name}{' '}
                {c.support_inside_subscription.technician.last_name}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (c) => <span style={{ color: 'var(--text-secondary)' }}>{c.email}</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (c) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {c.client_profile?.client_type === 'company' ? 'Empresa' : 'Particular'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (c) => {
        const s = STATUS_MAP[c.status] || STATUS_MAP.inactive;
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'created_at',
      header: 'Registro',
      align: 'right',
      render: (c) => (
        <span style={{ color: 'var(--text-tertiary)' }}>
          {new Date(c.created_at).toLocaleDateString('es-ES')}
        </span>
      ),
    },
  ];

  const hasFilter = Boolean(
    initialFilters.search ||
      initialFilters.status ||
      initialFilters.type ||
      initialFilters.assignedTechnician,
  );

  return (
    <>
      <FilterBar
        search={
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => {
              setSearch('');
              pushFilters({ search: '' });
            }}
            onBlur={() => pushFilters({ search })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pushFilters({ search });
            }}
            placeholder="Buscar por nombre o email..."
          />
        }
        filters={
          <>
            <Select
              value={initialFilters.status}
              onChange={(e) => pushFilters({ status: e.target.value })}
              options={STATUS_OPTIONS}
              aria-label="Filtrar por estado"
            />
            <Select
              value={initialFilters.type}
              onChange={(e) => pushFilters({ client_type: e.target.value })}
              options={TYPE_OPTIONS}
              aria-label="Filtrar por tipo de cliente"
            />
            <Select
              value={initialFilters.assignedTechnician}
              onChange={(e) =>
                pushFilters({ assigned_technician: e.target.value })
              }
              options={technicianOptions}
              aria-label="Filtrar por técnico asignado"
            />
          </>
        }
      />
      <Table<Client>
        card
        columns={columns}
        data={clients}
        rowKey={(c) => c.id}
        onRowClick={(c) => router.push(`/admin/clients/${c.id}`)}
        emptyIcon={UsersIcon}
        emptyTitle={hasFilter ? 'Sin resultados' : 'No hay clientes'}
        emptyDescription={
          hasFilter
            ? 'No se encontraron clientes con esos filtros.'
            : 'No hay clientes registrados'
        }
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
      />
      {meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={handlePageChange}
        />
      )}
      {selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              toast(
                'info',
                `Exportando ${selected.size} cliente${selected.size > 1 ? 's' : ''}...`,
              );
              setSelected(new Set());
            }}
          >
            Exportar
          </Button>
        </BulkActionBar>
      )}
    </>
  );
}

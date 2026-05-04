'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  EmptyState,
  Input,
  Pagination,
  SearchInput,
  Select,
  Table,
} from '../../../components/ui';
import type { TableColumn } from '../../../components/ui';
import type { ServiceListItem } from '../../../lib/api';
import {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
} from '../../../_shared/services';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'pending', label: 'En provisioning' },
  { value: 'provisioning', label: 'Provisioning' },
  { value: 'suspended', label: 'Suspendidos' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'failed', label: 'Fallidos' },
];

function mapStatusKey(status: string): keyof typeof SERVICE_STATUS_LABEL {
  switch (status) {
    case 'active':
    case 'pending':
    case 'suspended':
    case 'expired':
    case 'failed':
    case 'cancelled':
      return status;
    case 'provisioning':
      return 'pending';
    case 'terminated':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

interface Props {
  services: ServiceListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  errorMessage: string | null;
  initialFilters: { search: string; status: string; plugin: string };
}

export default function AdminServicesView({
  services,
  meta,
  errorMessage,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  /*
   * Filtros locales: el SearchInput / Input usan estado local para no
   * golpear `router.push` en cada keystroke (eso navegaría 1 vez por
   * tecla). El usuario aplica con Enter o blur. El Select de status
   * sí navega inmediatamente porque el cambio es discreto.
   */
  const [search, setSearch] = useState(initialFilters.search);
  const [plugin, setPlugin] = useState(initialFilters.plugin);

  function pushParams(next: { search?: string; status?: string; plugin?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const writeOrDelete = (key: string, value: string | undefined) => {
      if (value && value.length > 0) params.set(key, value);
      else params.delete(key);
    };
    if (next.search !== undefined) writeOrDelete('search', next.search);
    if (next.status !== undefined) writeOrDelete('status', next.status);
    if (next.plugin !== undefined) writeOrDelete('plugin', next.plugin);
    params.delete('page');
    startTransition(() => router.push(`/admin/services?${params.toString()}`));
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`/admin/services?${params.toString()}`));
  }

  const columns: TableColumn<ServiceListItem>[] = [
    {
      key: 'service',
      header: 'Servicio',
      render: (svc) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            {svc.label ?? svc.domain ?? svc.product.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {svc.product.name} · {svc.product.slug}
          </div>
        </div>
      ),
    },
    {
      key: 'plugin',
      header: 'Plugin',
      render: (svc) => (
        <code style={{ fontSize: 12 }}>
          {svc.provisioner_slug ?? svc.product.provisioner}
        </code>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (svc) => {
        const key = mapStatusKey(svc.status);
        return (
          <Badge variant={SERVICE_STATUS_TONE[key]}>
            {SERVICE_STATUS_LABEL[key]}
          </Badge>
        );
      },
    },
    {
      key: 'user',
      header: 'Cliente',
      render: (svc) => (
        <code style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {svc.user_id.slice(0, 8)}…
        </code>
      ),
    },
    {
      key: 'created_at',
      header: 'Contratado',
      render: (svc) =>
        new Date(svc.created_at).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <SearchInput
          placeholder="Buscar label / dominio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => pushParams({ search })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushParams({ search });
          }}
          style={{ minWidth: 240 }}
        />
        <Select
          value={initialFilters.status}
          onChange={(e) => pushParams({ status: e.target.value })}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Plugin (slug)"
          value={plugin}
          onChange={(e) => setPlugin(e.target.value)}
          onBlur={() => pushParams({ plugin })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushParams({ plugin });
          }}
          style={{ width: 180 }}
        />
      </div>

      {errorMessage ? (
        <EmptyState title="Error" description={errorMessage} />
      ) : services.length === 0 ? (
        <EmptyState
          title="Sin servicios"
          description="No hay servicios que coincidan con los filtros aplicados."
        />
      ) : (
        <>
          <Table columns={columns} data={services} rowKey={(s) => s.id} />
          {meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={handlePageChange}
              total={meta.total}
              limit={meta.limit}
            />
          )}
        </>
      )}
    </>
  );
}

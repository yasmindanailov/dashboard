'use client';

/**
 * /admin/services — Listado admin de servicios con filtros.
 *
 * Sprint 11 Fase 11.D (ADR-066 portal admin + ADR-070 + ADR-077).
 *
 * Vista federada para staff: lista todos los servicios contratados,
 * filtra por cliente / plugin / status / texto. El admin puede
 * profundizar al detalle (`/admin/services/:id` futuro Sprint 13)
 * o ejecutar reprovision/deprovision desde la UI tras Sprint 13 §13.AUTH.
 *
 * TODO(ADR-078, Sprint 13): migrar a Server Component cuando cookies
 * httpOnly estén activas. Ref DC.28. Este archivo es la última excepción
 * permitida del patrón 'use client' + localStorage según ADR-078 §3.2.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  EmptyState,
  Input,
  ListPage,
  Pagination,
  SearchInput,
  Select,
  Table,
} from '../../components/ui';
import type { TableColumn } from '../../components/ui';
import { servicesApi, type ServiceListItem } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';
import {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
} from '../../_shared/services';

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

export default function AdminServicesPage() {
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [meta, setMeta] = useState<PageMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pluginFilter, setPluginFilter] = useState('');

  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token') || ''
      : '';

  const load = useCallback(
    async (page = 1) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await servicesApi.adminList(token, {
          page,
          limit: 20,
          search: search || undefined,
          status: statusFilter || undefined,
          provisioner_slug: pluginFilter || undefined,
        });
        setServices(res.data);
        setMeta(res.meta);
      } catch (err) {
        setError(getErrorMessage(err) ?? 'No se pudieron cargar los servicios');
      } finally {
        setLoading(false);
      }
    },
    [token, search, statusFilter, pluginFilter],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const columns: TableColumn<ServiceListItem>[] = [
    {
      key: 'service',
      header: 'Servicio',
      render: (svc) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            {svc.label ?? svc.domain ?? svc.product.name}
          </div>
          <div
            style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}
          >
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
    <ListPage
      title="Servicios"
      subtitle={`${meta.total} servicio${meta.total === 1 ? '' : 's'} en plataforma`}
      filterBar={
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <SearchInput
            placeholder="Buscar label / dominio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Plugin (slug)"
            value={pluginFilter}
            onChange={(e) => setPluginFilter(e.target.value)}
            style={{ width: 180 }}
          />
        </div>
      }
      pagination={
        meta.totalPages > 1 ? (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            onPageChange={(p) => void load(p)}
            total={meta.total}
            limit={meta.limit}
          />
        ) : undefined
      }
    >
      {error ? (
        <EmptyState title="Error" description={error} />
      ) : loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>
      ) : services.length === 0 ? (
        <EmptyState
          title="Sin servicios"
          description="No hay servicios que coincidan con los filtros aplicados."
        />
      ) : (
        <Table columns={columns} data={services} rowKey={(s) => s.id} />
      )}
    </ListPage>
  );
}

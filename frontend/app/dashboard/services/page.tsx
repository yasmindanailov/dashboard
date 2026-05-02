'use client';

/**
 * /dashboard/services — Listado de servicios del cliente.
 *
 * Sprint 11 Fase 11.D (ADR-070 + ADR-077). Cierra parte de la cabeza
 * de cola P2: los clientes ya no necesitan abrir tickets para ver qué
 * servicios tienen contratados; el listado canónico vive aquí.
 *
 * Cada fila enlaza al detalle (`/dashboard/services/[id]`) que el
 * orquestador resuelve server-side con el plugin del producto.
 *
 * TODO(ADR-078, Sprint 13): migrar a Server Component cuando cookies
 * httpOnly estén activas. Ref DC.28. Este archivo es la última excepción
 * permitida del patrón 'use client' + localStorage según ADR-078 §3.2.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  EmptyState,
  ListPage,
  Pagination,
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

export default function ClientServicesPage() {
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [meta, setMeta] = useState<PageMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const res = await servicesApi.list(token, { page, limit: 20 });
        setServices(res.data);
        setMeta(res.meta);
      } catch (err) {
        setError(getErrorMessage(err) ?? 'No se pudieron cargar tus servicios');
      } finally {
        setLoading(false);
      }
    },
    [token],
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
            <Link
              href={`/dashboard/services/${svc.id}`}
              style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              {svc.label ?? svc.domain ?? svc.product.name}
            </Link>
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginTop: 2,
            }}
          >
            {svc.product.name}
          </div>
        </div>
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
      key: 'created_at',
      header: 'Contratado',
      render: (svc) =>
        new Date(svc.created_at).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
    },
    {
      key: 'actions',
      header: '',
      render: (svc) => (
        <Link
          href={`/dashboard/services/${svc.id}`}
          style={{
            color: 'var(--brand-600)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Ver detalle →
        </Link>
      ),
    },
  ];

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
        <EmptyState
          title="No se pudieron cargar tus servicios"
          description={error}
        />
      ) : loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>
      ) : services.length === 0 ? (
        <EmptyState
          title="Aún no tienes servicios"
          description="Cuando contrates un servicio aparecerá aquí con su estado y opciones de gestión."
        />
      ) : (
        <Table columns={columns} data={services} rowKey={(s) => s.id} />
      )}
    </ListPage>
  );
}

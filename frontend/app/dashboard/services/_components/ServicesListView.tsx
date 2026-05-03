'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  EmptyState,
  Pagination,
  Table,
} from '../../../components/ui';
import type { TableColumn } from '../../../components/ui';
import type { ServiceListItem } from '../../../lib/api';
import {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
} from '../../../_shared/services';

/* ═══════════════════════════════════════
   ServicesListView — Cliente island del listado de servicios cliente.
   Recibe data prehidratada por SC; gestiona la paginación cambiando
   `?page=` en searchParams.
   ═══════════════════════════════════════ */

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
}

export default function ServicesListView({ services, meta, errorMessage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
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

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`/dashboard/services?${params.toString()}`));
  }

  if (errorMessage) {
    return (
      <EmptyState
        title="No se pudieron cargar tus servicios"
        description={errorMessage}
      />
    );
  }
  if (services.length === 0) {
    return (
      <EmptyState
        title="Aún no tienes servicios"
        description="Cuando contrates un servicio aparecerá aquí con su estado y opciones de gestión."
      />
    );
  }
  return (
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
  );
}

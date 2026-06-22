'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Badge, EmptyState, Pagination, Table } from '../../../components/ui';
import type { TableColumn } from '../../../components/ui';
import {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
} from '../../../_shared/services';
import type { DomainListItem } from '../../../_shared/domains/types';

/* ═══════════════════════════════════════
   DomainsListView — island cliente de "Mis dominios".
   Recibe data prehidratada por el SC; pagina cambiando `?page=`.
   Sprint 15D Fase 15D.F.4.
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface Props {
  domains: DomainListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  errorMessage: string | null;
}

export default function DomainsListView({ domains, meta, errorMessage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const columns: TableColumn<DomainListItem>[] = [
    {
      key: 'domain',
      header: 'Dominio',
      render: (d) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            <Link
              href={`/dashboard/domains/${d.id}`}
              style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              {d.fqdn ?? '(sin nombre)'}
            </Link>
          </div>
          <div
            style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}
          >
            {d.product_name}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (d) => {
        const key = mapStatusKey(d.status);
        return (
          <Badge variant={SERVICE_STATUS_TONE[key]}>
            {SERVICE_STATUS_LABEL[key]}
          </Badge>
        );
      },
    },
    {
      key: 'expires_at',
      header: 'Caduca',
      render: (d) => formatDate(d.expires_at),
    },
    {
      key: 'actions',
      header: '',
      render: (d) => (
        <Link
          href={`/dashboard/domains/${d.id}`}
          style={{
            color: 'var(--brand-600)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Gestionar →
        </Link>
      ),
    },
  ];

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() =>
      router.push(`/dashboard/domains?${params.toString()}`),
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        title="No se pudieron cargar tus dominios"
        description={errorMessage}
      />
    );
  }
  if (domains.length === 0) {
    return (
      <EmptyState
        title="Aún no tienes dominios"
        description="Busca un nombre y regístralo: aparecerá aquí con su caducidad y opciones de gestión."
      />
    );
  }
  return (
    <>
      <Table columns={columns} data={domains} rowKey={(d) => d.id} />
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

/**
 * /dashboard/domains — "Mis dominios" — Sprint 15D Fase 15D.F.4.
 *
 * Server Component nativo (Modelo A, ADR-078 A1): el `dashboard/layout.tsx`
 * garantiza sesión; aquí cargamos el listado server-side vía `serverFetch`
 * (`GET /domains`, ownership por JWT). Los dominios SON services
 * (`product.type='domain'`); este portal los presenta con su caducidad y un
 * acceso directo al buscador para registrar nuevos.
 */

import Link from 'next/link';

import { Button, ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type {
  DomainListItem,
  ListDomainsResponse,
} from '../../_shared/domains/types';
import DomainsListView from './_components/DomainsListView';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function MyDomainsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);

  let domains: DomainListItem[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 1 };
  let errorMessage: string | null = null;
  try {
    const res = await serverFetch<ListDomainsResponse>(
      `/domains?page=${page}&limit=20`,
    );
    domains = res.data;
    meta = res.meta;
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar tus dominios';
  }

  return (
    <ListPage
      title="Mis dominios"
      subtitle={
        meta.total === 0
          ? 'Aquí aparecerán los dominios que registres'
          : `${meta.total} dominio${meta.total === 1 ? '' : 's'}`
      }
      action={
        <Link href="/dashboard/store/domains">
          <Button>Registrar dominio</Button>
        </Link>
      }
    >
      <DomainsListView
        domains={domains}
        meta={meta}
        errorMessage={errorMessage}
      />
    </ListPage>
  );
}

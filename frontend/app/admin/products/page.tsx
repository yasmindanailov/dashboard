/**
 * /admin/products — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Lista paginada + filtros via searchParams.
 * Mutación toggle-status via Server Action `toggleProductStatusAction`.
 * Crear / editar productos viven en Batch 4 (formularios).
 * ADR-078 Amendment A1.
 */

import Link from 'next/link';
import { Button, ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import { PlusIcon } from './icons';
import type { PaginatedResponse, ProductItem } from './types';
import ProductsListView from './_components/ProductsListView';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);
  const search = singleParam(params.search);
  const status = singleParam(params.status);
  const type = singleParam(params.type);

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '20');
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (type) query.set('type', type);

  let products: ProductItem[] = [];
  let meta = { total: 0, page, limit: 20, totalPages: 1 };
  try {
    const res = await serverFetch<PaginatedResponse>(
      `/products?${query.toString()}`,
    );
    products = res.data;
    meta = res.meta;
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  // F4·U25 — subtítulo dinámico 1:1 con el mockup: "N resultados" al filtrar,
  // "Catálogo · N productos" por defecto.
  const isFiltered = Boolean(search || status || type);
  const subtitle = isFiltered
    ? `${meta.total} resultado${meta.total !== 1 ? 's' : ''}`
    : `Catálogo · ${meta.total} producto${meta.total !== 1 ? 's' : ''}`;

  return (
    <ListPage
      title="Productos"
      subtitle={subtitle}
      action={
        <Link href="/admin/products/new">
          <Button>
            <PlusIcon /> Nuevo producto
          </Button>
        </Link>
      }
      wide
    >
      <ProductsListView
        products={products}
        meta={meta}
        initialFilters={{ search, status, type }}
      />
    </ListPage>
  );
}

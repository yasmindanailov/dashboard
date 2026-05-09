/**
 * /admin/products/[id]/edit — Sprint 13 §13.AUTH Fase E (Modelo A) +
 * Sprint 15C Fase 15C.E.2 (ADR-080 Amendment B).
 *
 * Server Component. Carga producto + lista de plugins disponibles
 * server-side y delega al Client `ProductEditForm`. Mutaciones
 * (update + pricing CRUD) via Server Actions con revalidatePath.
 * ADR-078 Amendment A1.
 */

import { redirect } from 'next/navigation';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import type { AdminPluginListItem } from '../../../../lib/api';
import ProductEditForm, { type InitialProduct } from './_components/ProductEditForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;

  let product: InitialProduct | null = null;
  try {
    product = await serverFetch<InitialProduct>(`/products/${id}`);
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  if (!product) {
    redirect('/admin/products');
  }

  // Prefetch plugins en paralelo al producto principal (idéntico patrón
  // a /admin/products/new — alimenta Select provisioner + sub-form
  // `provisioner_config` via @rjsf/core).
  let plugins: readonly AdminPluginListItem[] = [];
  try {
    plugins = await serverFetch<AdminPluginListItem[]>('/admin/plugins');
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  return <ProductEditForm initial={product} initialPlugins={plugins} />;
}

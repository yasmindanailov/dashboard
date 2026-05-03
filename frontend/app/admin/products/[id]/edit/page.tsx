/**
 * /admin/products/[id]/edit — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component. Carga producto server-side y delega al Client
 * `ProductEditForm`. Mutaciones (update + pricing CRUD) via Server
 * Actions con revalidatePath. ADR-078 Amendment A1.
 */

import { redirect } from 'next/navigation';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
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

  return <ProductEditForm initial={product} />;
}

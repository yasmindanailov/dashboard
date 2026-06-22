/**
 * /dashboard/store/[slug] — Configuración de producto — Sprint 15D Fase 15D.F.4.
 *
 * Paso de configuración del order flow (patrón WHMCS order form / Hostinger): el
 * catálogo manda aquí; aquí se elige el ciclo (y, para hosting, el dominio — paso
 * posterior) antes de "Añadir al carrito". Mantiene el catálogo limpio y escala
 * a opciones configurables. Server Component: carga el producto por slug.
 */

import Link from 'next/link';

import { AlertBanner, Card } from '../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { Pagination } from '../../../lib/types';
import type { Product } from '../../../_shared/billing/checkout/types';
import type { ProductPurchaseContext } from '../../../_shared/cart/types';
import ProductConfig from './_components/ProductConfig';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductConfigPage({ params }: PageProps) {
  const { slug } = await params;

  let product: Product | null = null;
  let errorMessage: string | null = null;
  try {
    const res = await serverFetch<Pagination<Product>>(
      '/products?status=active&limit=100',
    );
    product = (res.data || []).find((p) => p.slug === slug) ?? null;
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el producto';
  }

  if (!product || errorMessage) {
    return (
      <AlertBanner variant="danger">
        {errorMessage ?? 'Producto no encontrado.'}{' '}
        <Link href="/dashboard/store" style={{ fontWeight: 600 }}>
          Volver al catálogo
        </Link>
      </AlertBanner>
    );
  }

  // Los dominios se registran buscando un nombre, no desde una ficha de producto.
  if (product.type === 'domain') {
    return (
      <Card>
        <div style={{ padding: 20 }}>
          <AlertBanner variant="info">
            Los dominios se registran buscándolos por nombre.{' '}
            <Link href="/dashboard/store/domains" style={{ fontWeight: 600 }}>
              Ir a Dominios →
            </Link>
          </AlertBanner>
        </div>
      </Card>
    );
  }

  // Tienda consciente del estado: ¿puede comprarlo, ya lo tiene, o al límite?
  // Si el contexto falla, degradamos a "comprable" (el checkout es la autoridad).
  let context: ProductPurchaseContext | null = null;
  try {
    context = await serverFetch<ProductPurchaseContext>(
      `/products/${product.id}/purchase-context`,
    );
  } catch {
    context = null;
  }

  return <ProductConfig product={product} context={context} />;
}

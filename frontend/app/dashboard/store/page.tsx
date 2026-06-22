/**
 * /dashboard/store — Tienda (catálogo de productos) — Sprint 15D Fase 15D.F.4.
 *
 * Server Component: carga el catálogo server-side (`/products`) y delega en la
 * isla `<StoreView>` el "añadir al carrito". Los dominios NO se listan aquí (se
 * registran buscando un nombre en `/dashboard/domains/search`); ambos alimentan
 * EL MISMO carrito (`/dashboard/cart`).
 */

import { ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { Pagination } from '../../lib/types';
import type { Product } from '../../_shared/billing/checkout/types';
import CartLink from '../../_shared/cart/CartLink';
import StoreView from './_components/StoreView';

export default async function StorePage() {
  let products: Product[] = [];
  let errorMessage: string | null = null;
  try {
    const res = await serverFetch<Pagination<Product>>(
      '/products?status=active&limit=50',
    );
    products = (res.data || []).filter(
      (p) => p.type !== 'domain' && p.pricing.some((pr) => pr.active),
    );
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar la tienda';
  }

  return (
    <ListPage
      title="Tienda"
      subtitle="Contrata hosting y servicios. Los dominios se registran en el buscador."
      action={<CartLink />}
    >
      <StoreView products={products} errorMessage={errorMessage} />
    </ListPage>
  );
}

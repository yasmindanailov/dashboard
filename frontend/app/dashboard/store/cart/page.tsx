/**
 * /dashboard/store/cart — Tienda · carrito unificado — Sprint 15D Fase 15D.F.4.
 *
 * El carrito vive en la Tienda (no en el shell global). Ítems mixtos
 * producto+dominio → un único checkout (`POST /billing/checkout/items`). Server
 * Component shell; el carrito es client-side (localStorage) → isla `<CartView>`.
 */

import CartView from '../_components/CartView';

export default function StoreCartPage() {
  return <CartView />;
}

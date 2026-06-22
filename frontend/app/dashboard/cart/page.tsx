/**
 * /dashboard/cart — Carrito unificado (producto + dominio) — Sprint 15D F.4.
 *
 * Server Component shell; el carrito vive client-side (localStorage) → isla
 * `<CartView>`. Un único checkout multi-ítem → `POST /billing/checkout/items`
 * (crea N services pending + 1 factura; DOM-INV-2/3/5 + precio R5 server-side).
 */

import { FormPage } from '../../components/ui';
import CartView from './_components/CartView';

export default function CartPage() {
  return (
    <FormPage
      breadcrumb={[
        { label: 'Inicio', href: '/dashboard' },
        { label: 'Carrito' },
      ]}
      title="Tu carrito"
    >
      <CartView />
    </FormPage>
  );
}

/**
 * /dashboard/domains/cart — Carrito de dominios — Sprint 15D Fase 15D.F.4.
 *
 * Server Component shell; el carrito vive client-side (localStorage) → isla
 * `<DomainCart>`. Al confirmar, la Server Action `checkoutDomainCartAction`
 * llama a `POST /domains/cart/checkout` (crea N services pending + 1 factura;
 * DOM-INV-2/3/5 las aplica el backend). v1: factura simplificada por defecto.
 */

import { FormPage } from '../../../components/ui';
import DomainCart from './_components/DomainCart';

export default function DomainCartPage() {
  return (
    <FormPage
      breadcrumb={[
        { label: 'Mis dominios', href: '/dashboard/domains' },
        { label: 'Carrito' },
      ]}
      title="Carrito de dominios"
    >
      <DomainCart />
    </FormPage>
  );
}

/**
 * Layout de la Tienda — Sprint 15D Fase 15D.F.4.
 *
 * Chrome común de la sección de compra (catálogo + dominios + carrito): cabecera
 * con sub-nav y acceso al carrito. La Tienda es autocontenida (patrón WHMCS/OVH/
 * Hostinger: comprar = sección aparte de la gestión); el carrito vive aquí, NO en
 * el shell global del dashboard.
 */

import type { ReactNode } from 'react';

import StoreHeader from './_components/StoreHeader';

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <StoreHeader />
      {children}
    </div>
  );
}

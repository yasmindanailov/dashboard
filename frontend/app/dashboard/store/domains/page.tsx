/**
 * /dashboard/store/domains — Tienda · registrar y transferir dominios.
 *
 * El comercio de dominios vive DENTRO de la Tienda (patrón WHMCS/OVH/Hostinger/
 * GoDaddy: comprar/transferir un dominio es parte del order flow). Server Component
 * shell; las dos puertas (Registrar | Transferir, 15D.II.T2c.3) son islas cliente
 * que añaden al MISMO carrito único. La gestión de tus dominios ya registrados vive
 * en `/dashboard/domains`.
 */

import DomainStoreTabs from '../_components/DomainStoreTabs';

export default function StoreDomainsPage() {
  return <DomainStoreTabs />;
}

/**
 * /dashboard/store/domains — Tienda · buscar y registrar dominios — 15D.F.4.
 *
 * El buscador de dominios vive DENTRO de la Tienda (patrón WHMCS/OVH/Hostinger/
 * GoDaddy: comprar un dominio es parte del order flow). Server Component shell;
 * la búsqueda es interactiva → isla `<DomainSearch>`, que añade al MISMO carrito
 * que el catálogo. La gestión de tus dominios ya registrados vive en
 * `/dashboard/domains`.
 */

import DomainSearch from '../_components/DomainSearch';

export default function StoreDomainsPage() {
  return <DomainSearch />;
}

/**
 * /dashboard/domains/search — Buscador de dominios — Sprint 15D Fase 15D.F.4.
 *
 * Server Component shell (sesión garantizada por el layout); la búsqueda es
 * interactiva → isla cliente `<DomainSearch>`. El precio se resuelve server-side
 * (R5) vía la Server Action `checkDomainAvailabilityAction`.
 */

import { FormPage } from '../../../components/ui';
import DomainSearch from './_components/DomainSearch';

export default function DomainSearchPage() {
  return (
    <FormPage
      breadcrumb={[
        { label: 'Mis dominios', href: '/dashboard/domains' },
        { label: 'Buscar' },
      ]}
      title="Buscar y registrar dominio"
    >
      <DomainSearch />
    </FormPage>
  );
}

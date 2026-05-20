/**
 * ServiceActionCluster — Sprint 15C.II Fase F.12.4 → F.12.5 (Amendment VII).
 *
 * Clúster de acciones del header del detalle de servicio (Regla D2: 1 primaria
 * + máx 2 secundarias + resto en el menú ⋯):
 *   - **Primaria**: Abrir panel (SSO) — `<SsoButton>`.
 *   - **Secundaria**: Gestionar DNS — `<Link>` + DS `<Button variant="secondary">`.
 *   - **Menú ⋯**: `menu` (slot) — `<ServiceActionsMenu>` (cliente) o
 *     `<AdminServiceActionsMenu>` (admin, inyectado desde la ruta). F.12.5
 *     consolidó TODAS las operaciones admin ahí (la tab "Gestión" desapareció).
 *
 * Presentacional: el caller (`ServiceHeaderCard`, SC) resuelve SSO/DNS según
 * rol×estado y compone el `menu`. Este componente no tiene estado propio (la
 * interactividad vive en `<SsoButton>` y en el `menu`); es SC-compatible.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';

import { Button } from '../../../components/ui';
import { t } from '../../i18n';
import { SsoButton } from '../SsoButton';
import styles from '../service-detail.module.css';

interface ServiceActionClusterProps {
  serviceId: string;
  /** Etiqueta del panel SSO si hay primaria "Abrir panel"; `null` si no. */
  ssoPanelLabel: string | null;
  /** Href de gestión DNS si hay secundaria; `null` si no. */
  dnsHref: string | null;
  /** True si la página es admin (copy GDPR del SSO). */
  isAdmin: boolean;
  /** Menú "Más acciones" (⋯) ya compuesto por el caller. */
  menu: ReactNode;
}

export function ServiceActionCluster({
  serviceId,
  ssoPanelLabel,
  dnsHref,
  isAdmin,
  menu,
}: ServiceActionClusterProps) {
  if (ssoPanelLabel === null && dnsHref === null && !menu) return null;

  return (
    <div className={styles.headerActions}>
      {ssoPanelLabel !== null && (
        <SsoButton serviceId={serviceId} panelLabel={ssoPanelLabel} isAdmin={isAdmin} />
      )}

      {dnsHref !== null && (
        <Link href={dnsHref}>
          <Button variant="secondary">{t('service.detail.dns.cta')}</Button>
        </Link>
      )}

      {menu}
    </div>
  );
}

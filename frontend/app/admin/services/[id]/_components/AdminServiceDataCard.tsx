/**
 * AdminServiceDataCard — "Datos técnicos" del detalle de servicio (admin).
 *
 * Sprint 15C.II Fase C round 7 → F.12.5 (Amendment V + VII): rediseño a las
 * primitivas DS `<SectionCard>` + `<DescriptionList>` + `<CopyableId>`. Vive en
 * el ASIDE del overview (rail 1fr). Estándar Stripe/Vercel admin: info legible
 * primero (cliente/email/dominio/plan), IDs técnicos con click-to-copy.
 *
 * Amendment VII:
 *   - **Salud del plugin reubicada aquí** (antes badge suelto en la zona de
 *     banners — punto 1): es metadata operativa, su sitio son los datos
 *     técnicos. Se renderiza con `<ProviderHealthBadge>` (inline) si hay datos.
 *   - **Sin fila "Estado"** (punto 6, Regla D4): el estado del servicio ya está
 *     en el badge del header; no se duplica aquí.
 *
 * Server Component (NO `'use client'`) — `CopyableId`/`ProviderHealthBadge` SC.
 */

import Link from 'next/link';

import {
  CopyableId,
  DescriptionList,
  SectionCard,
  type DescriptionItem,
} from '../../../../components/ui';
import type {
  PluginHealthSummary,
  ServiceDetailResponse,
} from '../../../../lib/api';
import styles from './AdminServiceDataCard.module.css';
import { ProviderHealthBadge } from './ProviderHealthBadge';

interface AdminServiceDataCardProps {
  data: ServiceDetailResponse;
  /** Salud del plugin (fail-soft `null`). Si presente, se muestra como fila. */
  pluginHealth?: PluginHealthSummary | null;
}

/**
 * Formato fecha amigable + tiempo relativo (Stripe/GitHub). SSR-stable: calcula
 * el relativo server-side (no usa Date.now() en hidratación).
 */
function formatDateWithRelative(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  let relative: string;
  if (diffSec < 60) relative = 'hace unos segundos';
  else if (diffSec < 3600) {
    const m = Math.round(diffSec / 60);
    relative = `hace ${m} minuto${m === 1 ? '' : 's'}`;
  } else if (diffSec < 86400) {
    const h = Math.round(diffSec / 3600);
    relative = `hace ${h} hora${h === 1 ? '' : 's'}`;
  } else if (diffSec < 30 * 86400) {
    const days = Math.round(diffSec / 86400);
    relative = `hace ${days} día${days === 1 ? '' : 's'}`;
  } else {
    const months = Math.round(diffSec / (30 * 86400));
    relative = `hace ${months} mes${months === 1 ? '' : 'es'}`;
  }
  return `${dateStr}, ${timeStr} · ${relative}`;
}

export function AdminServiceDataCard({
  data,
  pluginHealth,
}: AdminServiceDataCardProps) {
  const { service } = data;
  const isFromProductPlugin = !service.provisioner_slug;
  const effectiveProvisioner =
    service.provisioner_slug ?? service.product_provisioner;

  const items: DescriptionItem[] = [
    {
      key: 'client',
      term: 'Cliente',
      value: (
        <Link href={`/admin/clients/${service.user_id}`} className={styles.link}>
          {service.client_name}
        </Link>
      ),
    },
    {
      key: 'email',
      term: 'Email',
      value: (
        <a href={`mailto:${service.client_email}`} className={styles.link}>
          {service.client_email}
        </a>
      ),
    },
    {
      key: 'user-id',
      term: 'ID cliente',
      value: <CopyableId id={service.user_id} label="ID cliente" />,
    },
  ];

  if (service.domain) {
    items.push({ key: 'domain', term: 'Dominio', value: service.domain });
  }

  items.push(
    {
      key: 'product',
      term: 'Producto',
      value: (
        <>
          {service.product_name}{' '}
          <span className={styles.mutedMono}>
            ({service.product_slug} · {service.product_type})
          </span>
        </>
      ),
    },
    {
      key: 'plugin',
      term: 'Plugin',
      value: (
        <span className={styles.mutedMono}>
          {effectiveProvisioner}
          {isFromProductPlugin && ' · desde producto'}
        </span>
      ),
    },
  );

  // Salud del plugin (reubicada desde la zona de banners — punto 1). Solo si el
  // fetch fail-soft trajo datos y hay plugin asociado.
  if (pluginHealth && pluginHealth.pluginSlug) {
    items.push({
      key: 'plugin-health',
      term: 'Salud del plugin',
      value: <ProviderHealthBadge health={pluginHealth} />,
    });
  }

  items.push(
    {
      key: 'service-id',
      term: 'ID servicio',
      value: <CopyableId id={service.id} label="ID servicio" />,
    },
    {
      key: 'created',
      term: 'Creado',
      value: formatDateWithRelative(service.created_at),
    },
  );

  if (service.cancelled_at) {
    items.push({
      key: 'cancelled',
      term: 'Cancelado',
      value: formatDateWithRelative(service.cancelled_at),
    });
  }

  return (
    <SectionCard title="Datos técnicos">
      <DescriptionList items={items} />
    </SectionCard>
  );
}

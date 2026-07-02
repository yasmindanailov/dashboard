'use client';

/**
 * ServiceHubCard — Sprint F4·W3·U04.
 *
 * Card ficha del hub "Mis servicios" (`Servicios Cards Spec` Variante A). Toda
 * la card navega al detalle (onClick); las quick-actions (Abrir panel / DNS /
 * Ver detalle) viven en el menú ⋯ con `stopPropagation` para no navegar al
 * usarlo. Sin gauges ni botones azules (repudiados por el spec). El popover del
 * ⋯ usa `z-index` alto del DS y la card no crea stacking context → nunca queda
 * tapado por cards vecinas del grid.
 */
import type { KeyboardEvent, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Globe,
  Monitor,
  Network,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import {
  Badge,
  Dropdown,
  IconWell,
  StatusDot,
  type DropdownItem,
} from '../../../components/ui';
import { t } from '../../../_shared/i18n';
import { useServiceSso } from '../../../_shared/services/useServiceSso';
import type { ServiceCardData, ServiceHubKind } from './service-hub-vm';
import styles from './services-hub.module.css';

const KIND_ICON: Record<ServiceHubKind, LucideIcon> = {
  service: Monitor,
  domain: Globe,
  support_inside: ShieldCheck,
};

export default function ServiceHubCard({
  kind,
  href,
  title,
  badge,
  meta,
  strip,
  dnsHref,
  sso,
}: ServiceCardData) {
  const router = useRouter();
  // Hook llamado incondicionalmente (regla de hooks); si no hay SSO, el ítem no
  // se añade y `launch` no se invoca.
  const { launch, loading } = useServiceSso(sso?.serviceId ?? '', false);

  const Icon = KIND_ICON[kind];

  const items: DropdownItem[] = [];
  if (sso) {
    const label = sso.panelLabel ? `Abrir ${t(sso.panelLabel)}` : 'Abrir panel';
    items.push({
      label: loading ? 'Abriendo…' : label,
      onClick: launch,
      disabled: loading,
      icon: <ExternalLink size={15} />,
    });
  }
  if (dnsHref) {
    items.push({
      label: 'Gestionar DNS',
      onClick: () => router.push(dnsHref),
      icon: <Network size={15} />,
    });
  }
  items.push({
    label: 'Ver detalle',
    onClick: () => router.push(href),
    icon: <ArrowRight size={15} />,
  });

  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

  return (
    <div
      className={styles.card}
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(href);
      }}
    >
      <div className={styles.body}>
        <IconWell
          icon={Icon}
          tone="brand"
          size="lg"
          filled={kind === 'support_inside'}
        />
        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{title}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <div className={styles.meta}>{meta}</div>
        </div>
        <div className={styles.menu} onClick={stop} onKeyDown={stop}>
          <Dropdown items={items} align="right" />
        </div>
      </div>
      <div className={styles.strip} data-tone={strip.tone}>
        <span className={styles.stripStatus}>
          <StatusDot color={strip.tone} pulse={strip.tone === 'success'} />
          {strip.text}
        </span>
        <span className={styles.stripLink}>
          Ver detalle
          <ChevronRight size={14} />
        </span>
      </div>
    </div>
  );
}

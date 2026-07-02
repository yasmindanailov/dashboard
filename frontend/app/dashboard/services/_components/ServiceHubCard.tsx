'use client';

/**
 * ServiceHubCard — Sprint F4·W3·U04.
 *
 * Card del hub "Mis servicios" 1:1 con `MisServicios.dc.html`: header (icon-well
 * + nombre + badge + subtítulo) + cuerpo de key-values + footer de acciones. Sin
 * ⋯ ni tira de estado (redundantes, decisión Yasmin). Support Inside = card
 * destacada (borde/sombra + header tintado). "Abrir panel" (SSO) es la única
 * acción con estado cliente (hook `useServiceSso`); el resto navegan.
 */
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Globe,
  Monitor,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { Badge, Button, IconWell } from '../../../components/ui';
import { useServiceSso } from '../../../_shared/services/useServiceSso';
import type { CardAction, ServiceCardData, ServiceHubKind } from './service-hub-vm';
import styles from './services-hub.module.css';

const KIND_ICON: Record<ServiceHubKind, LucideIcon> = {
  service: Monitor,
  domain: Globe,
  support_inside: ShieldCheck,
};

export default function ServiceHubCard({
  kind,
  highlight,
  title,
  badge,
  subtitle,
  facts,
  actions,
}: ServiceCardData) {
  const router = useRouter();
  const ssoAction = actions.find((a) => a.type === 'sso');
  // Hook incondicional (regla de hooks); si no hay SSO, `launch` no se usa.
  const { launch, loading } = useServiceSso(ssoAction?.serviceId ?? '', false);

  const Icon = KIND_ICON[kind];
  const detail = actions.find((a) => a.variant === 'detail');
  const buttons = actions.filter((a) => a.variant !== 'detail');

  const renderButton = (a: CardAction) => {
    if (a.type === 'sso') {
      return (
        <Button
          key={a.label}
          size="sm"
          variant="primary"
          rightIcon={<ExternalLink size={13} />}
          onClick={launch}
          disabled={loading}
        >
          {loading ? 'Abriendo…' : a.label}
        </Button>
      );
    }
    return (
      <Button
        key={a.label}
        size="sm"
        variant={a.variant === 'primary' ? 'primary' : 'secondary'}
        onClick={() => a.href && router.push(a.href)}
      >
        {a.label}
      </Button>
    );
  };

  return (
    <article className={`${styles.card} ${highlight ? styles.cardHighlight : ''}`}>
      <header className={`${styles.header} ${highlight ? styles.headerTinted : ''}`}>
        <IconWell icon={Icon} tone="brand" size="lg" filled={highlight} />
        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{title}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <div className={styles.subtitle}>{subtitle}</div>
        </div>
      </header>

      {facts.length > 0 && (
        <div className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <div className={styles.factLabel}>{f.label}</div>
              <div className={styles.factValue}>
                {f.check && <Check size={14} className={styles.factCheck} />}
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className={styles.footer}>
        {buttons.map(renderButton)}
        {detail?.href && (
          <Link href={detail.href} className={styles.detailLink}>
            {detail.label}
            <ChevronRight size={15} />
          </Link>
        )}
      </footer>
    </article>
  );
}

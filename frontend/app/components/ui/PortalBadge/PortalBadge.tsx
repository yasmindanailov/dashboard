import type { ReactNode } from 'react';
import styles from './PortalBadge.module.css';
import {
  portalLabelForRole,
  type PortalVariant,
} from '../../../lib/portal';

/**
 * PortalBadge — header del Sidebar con identidad del portal (ADR-066).
 *
 * Renderiza el logo (texto "Aelium" por default) + un subtítulo pequeño
 * debajo que identifica el portal en el que el usuario está navegando:
 *   - "Portal de Administración" (staff)
 *   - "Portal de Cliente"
 *   - "Portal de Partner" (Sprint 19)
 *
 * Cumple R16 (Design System único) + D11 (voz de marca cercana). El
 * texto canónico vive en `lib/portal.ts` (helper `portalLabelForRole`)
 * para evitar duplicación entre layouts.
 *
 * Ejemplos:
 *   <PortalBadge variant="admin" />              // "Aelium" + "Portal de Administración"
 *   <PortalBadge variant="client" logo={null} /> // solo subtitle (cuando hay un logo gráfico aparte)
 *   <PortalBadge variant="admin" compact />      // sólo logo, oculta subtítulo (Sidebar colapsado)
 *
 * Props:
 *   - variant: el portal canónico ('admin' | 'client' | 'partner').
 *   - subtitle: opcional, sobreescribe el texto resuelto desde variant.
 *   - logo: ReactNode personalizado o `null` para omitir el span (modo
 *     subtítulo-only, útil cuando el Sidebar ya tiene un logo gráfico
 *     externo). Default: texto "Aelium".
 *   - compact: oculta el subtítulo (útil cuando el Sidebar está colapsado).
 */
export interface PortalBadgeProps {
  variant: PortalVariant;
  subtitle?: string;
  logo?: ReactNode | null;
  compact?: boolean;
  className?: string;
}

const VARIANT_TO_ROLE_SLUG: Record<PortalVariant, string> = {
  admin: 'superadmin',
  client: 'client',
  partner: 'partner',
};

export function PortalBadge({
  variant,
  subtitle,
  logo,
  compact = false,
  className = '',
}: PortalBadgeProps) {
  const resolvedSubtitle =
    subtitle ?? portalLabelForRole(VARIANT_TO_ROLE_SLUG[variant]);

  // logo === null explícito → modo subtitle-only (Sidebar tiene logo gráfico
  // externo). logo undefined → render default "Aelium".
  const renderLogo = logo === null ? null : (logo ?? 'Aelium');

  return (
    <div
      className={`${styles.portalBadge} ${styles[variant]} ${className}`.trim()}
      data-portal={variant}
    >
      {renderLogo !== null && (
        <span className={styles.logo}>{renderLogo}</span>
      )}
      {!compact && (
        <span className={styles.subtitle}>{resolvedSubtitle}</span>
      )}
    </div>
  );
}

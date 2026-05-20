/**
 * ProviderHealthBadge — Sprint 15C.II Fase F.11.1 (R3 frozen §A.11.10.8.2).
 *
 * Mini-badge inline en `/admin/services/[id]` que resume la salud del
 * plugin in-process para el service: `operativo` / `degradado` / `caído`.
 * Lee del agregado canónico expuesto por `GET /admin/services/:id/plugin-health`
 * (worst-case sobre los breakers conocidos del plugin —
 * `derivePluginHealth` en `core/provisioning/circuit-breaker.ts`).
 *
 * Doctrina (R1+R3 frozen):
 *   - **Admin-only puro** — vive en `_components/` admin-only, NO en
 *     `_shared/` con prop `isAdmin`. L16 NO universal: cuando un
 *     componente es admin-only por contrato (sin variante cliente per
 *     ADR-070 alcance funcional), `_components/` admin-only directo es
 *     la ubicación canónica. Lección heredable F.11.
 *   - **In-process** — los breakers son in-process (ADR-080 §5); el
 *     tooltip etiqueta "estado en esta instancia" — distinto a las
 *     métricas externas del proveedor.
 *   - **Server-component compatible** — sin hooks, sin estado, sin
 *     Server Actions (mismo patrón que `<SslStatusCard>` F.7 +
 *     `<AppShortcutsCard>` F.10).
 *   - **Link al detalle F.2** — el badge linkea a
 *     `/admin/settings/plugins/[slug]` (el `<PluginOperationalOverview>`
 *     completo) para que el admin investigue qué operación está caída.
 *   - **Capability-driven por presencia** — si `health.pluginSlug` está
 *     vacío (service sin plugin asociado, p.ej. legacy/manual), el badge
 *     no se renderiza (`null`). Coherente patrón A5/A6/A7/A8/A9.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge, type BadgeVariant } from '../../../../components/ui';
import { t } from '../../../../_shared/i18n';
import type {
  PluginHealthState,
  PluginHealthSummary,
} from '../../../../lib/api';
import styles from './ProviderHealthBadge.module.css';

interface ProviderHealthBadgeProps {
  health: PluginHealthSummary;
}

const STATE_TO_BADGE_VARIANT: Record<PluginHealthState, BadgeVariant> = {
  operational: 'success',
  degraded: 'warning',
  down: 'danger',
};

const STATE_TO_LABEL_KEY: Record<PluginHealthState, string> = {
  operational: 'service.provider_health.operational',
  degraded: 'service.provider_health.degraded',
  down: 'service.provider_health.down',
};

export function ProviderHealthBadge({
  health,
}: ProviderHealthBadgeProps): ReactNode {
  if (!health.pluginSlug) {
    // Service sin plugin asociado (legacy/manual). Cero badge.
    return null;
  }

  const variant = STATE_TO_BADGE_VARIANT[health.state];
  const stateLabel = t(STATE_TO_LABEL_KEY[health.state]);
  // Tooltip listando breakers individuales — el admin entiende cuál
  // operación está caída sin abrir el detalle del plugin. Si NO hay
  // breakers conocidos (operaciones nunca invocadas en esta instancia)
  // el tooltip indica eso.
  const tooltip =
    health.breakers.length === 0
      ? t('service.provider_health.tooltip_no_breakers')
      : `${t('service.provider_health.tooltip_in_process')} · ${health.breakers
          .map((b) => `${b.operation}=${b.state}`)
          .join(' · ')}`;

  // F.12.5 (Amendment VII): contenido inline (badge + enlace) usado como valor
  // de la fila "Salud del plugin" en la card Datos técnicos. El término de la
  // fila ya provee la etiqueta, así que aquí no se repite el prefijo.
  return (
    <span className={styles.row}>
      <span title={tooltip}>
        <Badge variant={variant}>{stateLabel}</Badge>
      </span>
      <Link
        href={`/admin/settings/plugins/${health.pluginSlug}`}
        className={styles.link}
      >
        {t('service.provider_health.link_to_overview')} →
      </Link>
    </span>
  );
}

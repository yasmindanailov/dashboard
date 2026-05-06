import { Badge, type BadgeVariant } from '../../components/ui';
import type {
  PluginCircuitStateSummary,
} from '../../lib/api';

/**
 * PluginStatusBadge — Sprint 15A Fase H.1 (ADR-080 §7).
 *
 * Render canónico del estado operativo de un plugin combinando:
 *   1. enabled (DB) — Activo / Deshabilitado.
 *   2. circuit_state — si alguno de los circuit breakers del plugin
 *      (getServiceInfo / executeAction) está open, prevalece sobre
 *      "enabled" porque el plugin está temporalmente caído.
 *
 * Mapping canónico:
 *   - circuit open                 → variant=danger,  label="Caído"
 *   - circuit half-open            → variant=warning, label="Recuperando"
 *   - enabled=true (closed)        → variant=success, label="Activo"
 *   - enabled=false                → variant=neutral, label="Deshabilitado"
 *
 * Doctrina: el badge JAMÁS muestra detalles internos del breaker
 * (last_error_code, downtime_seconds) — eso vive en notif superadmin
 * (Sprint 15A Fase F.2). El badge es resumen visual.
 */

interface Props {
  enabled: boolean;
  circuitState: PluginCircuitStateSummary;
}

export function PluginStatusBadge({ enabled, circuitState }: Props) {
  const status = resolveStatus(enabled, circuitState);
  return <Badge variant={status.variant}>{status.label}</Badge>;
}

function resolveStatus(
  enabled: boolean,
  circuitState: PluginCircuitStateSummary,
): { variant: BadgeVariant; label: string } {
  const states = [circuitState.getServiceInfo, circuitState.executeAction];
  if (states.includes('open')) {
    return { variant: 'danger', label: 'Caído' };
  }
  if (states.includes('half-open')) {
    return { variant: 'warning', label: 'Recuperando' };
  }
  if (enabled) {
    return { variant: 'success', label: 'Activo' };
  }
  return { variant: 'neutral', label: 'Deshabilitado' };
}

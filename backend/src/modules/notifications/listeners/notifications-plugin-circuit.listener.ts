import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { NotificationsService } from '../notifications.service';

interface PluginCircuitOpenedPayload {
  breaker_name: string;
  opened_at: string;
  last_error_code: string | null;
  failure_count: number;
  reset_timeout_ms: number;
}

interface PluginCircuitClosedPayload {
  breaker_name: string;
  closed_at: string;
  downtime_seconds: number;
}

/**
 * NotificationsPluginCircuitListener — Sprint 15A Fase F.2 (ADR-080 §5).
 *
 * Consume los eventos del circuit breaker:
 *   - `plugin.circuit_opened` → alerta a superadmins (campana + email).
 *     Severidad alta: un proveedor caído impacta a clientes activos en el
 *     dashboard (lecturas de getServiceInfo + acciones inline fallan).
 *   - `plugin.circuit_closed` → notif `internal` informativa de resolución
 *     (sin email — el superadmin ya está alertado del problema; saber que
 *     se resolvió no merece otro email).
 *
 * El nombre del breaker codifica `<plugin_slug>:<operation>` (ej.
 * `enhance_cp:getServiceInfo`). Se parsea para enriquecer el payload con
 * `plugin_slug` y `operation` separados — más legible para el superadmin.
 *
 * Sin guard anti-loop: este listener solo emite a notifications + log;
 * NO dispara código que pueda re-emitir `plugin.circuit_*` events.
 *
 * Degradación elegante (R7): si `dispatchToSuperadmins` falla, log error
 * pero no relanzar — el evento ya fue procesado por audit (Sprint 15A
 * Fase G), perder la notif no es bloqueante.
 */
@Injectable()
export class NotificationsPluginCircuitListener {
  private readonly logger = new Logger(NotificationsPluginCircuitListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('plugin.circuit_opened')
  async handleCircuitOpened(
    payload: PluginCircuitOpenedPayload,
  ): Promise<void> {
    const { plugin_slug, operation } = parseBreakerName(payload.breaker_name);
    try {
      await this.notifications.dispatchToSuperadmins('plugin.circuit_opened', {
        ...payload,
        plugin_slug,
        operation,
      } as unknown as Record<string, unknown>);
      this.logger.warn(
        `Plugin circuit OPENED: ${payload.breaker_name} ` +
          `(failures=${payload.failure_count}, ` +
          `last_code=${payload.last_error_code ?? 'unknown'}). Superadmins alerted.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to alert superadmins about plugin.circuit_opened (${payload.breaker_name}): ${getErrorMessage(err)}`,
      );
    }
  }

  @OnEvent('plugin.circuit_closed')
  async handleCircuitClosed(
    payload: PluginCircuitClosedPayload,
  ): Promise<void> {
    const { plugin_slug, operation } = parseBreakerName(payload.breaker_name);
    try {
      await this.notifications.dispatchToSuperadmins('plugin.circuit_closed', {
        ...payload,
        plugin_slug,
        operation,
      } as unknown as Record<string, unknown>);
      this.logger.log(
        `Plugin circuit CLOSED: ${payload.breaker_name} ` +
          `(downtime=${payload.downtime_seconds}s). Resolution notified.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to notify superadmins about plugin.circuit_closed (${payload.breaker_name}): ${getErrorMessage(err)}`,
      );
    }
  }
}

/**
 * Convención `<plugin_slug>:<operation>` (ADR-080 §5). Si el formato no
 * encaja, devolvemos el nombre completo como `plugin_slug` y `unknown`
 * como `operation` — permite que listeners sigan funcionando si en el
 * futuro se introducen breakers con nombre custom.
 */
function parseBreakerName(name: string): {
  plugin_slug: string;
  operation: string;
} {
  const idx = name.indexOf(':');
  if (idx <= 0 || idx === name.length - 1) {
    return { plugin_slug: name, operation: 'unknown' };
  }
  return {
    plugin_slug: name.slice(0, idx),
    operation: name.slice(idx + 1),
  };
}

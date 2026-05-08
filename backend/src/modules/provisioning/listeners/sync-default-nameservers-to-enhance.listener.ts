import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { EnhanceDnsDefaultsService } from '../../../plugins/provisioners/enhance_cp/enhance-dns-defaults.service';

/**
 * Sprint 15C Fase 15C.D — listener NS-sync C3 → C2.
 *
 * Materializa ADR-082 §4 (NS-sync 3 capas — propagación de C3 setting
 * Aelium fuente de verdad → C2 default records cluster Enhance).
 *
 * Cuándo se dispara:
 *   - Cuando un superadmin edita el setting `provisioning.default_nameservers`
 *     desde `/admin/settings` (Sprint 12 — pendiente de implementar la UI
 *     de settings). El handler de PATCH del setting **emite el evento
 *     canónico** `provisioning.default_nameservers_changed` con payload
 *     `{ newValue: string[]; oldValue: string[]; changedBy: string }`.
 *
 * Estado actual (Sprint 15C):
 *   - Hoy NO hay endpoint admin que actualice settings runtime — la única
 *     vía de cambio del setting es modificar el seed + reseed manual. Por
 *     tanto este listener NO se ejecuta en producción todavía.
 *   - Existe ahora con dos propósitos canónicos:
 *       1. Tener el listener escrito + testeado para que cuando Sprint 12
 *          implemente la UI admin sólo necesite emitir el evento.
 *       2. Servir de patrón canónico para futuros listeners
 *          `<category>.<key>_changed`.
 *
 * Qué hace:
 *   - Llama a `EnhanceDnsDefaultsService.applyClusterNameservers(newValue)`.
 *     Idempotente: añade los NS faltantes, preserva los existentes, alerta
 *     stale. NO borra automáticamente (operador decide).
 *
 * Errores: degradación elegante (log WARN). Si Enhance no responde, el
 * setting Aelium ya cambió pero el cluster Enhance se queda en estado
 * inconsistente hasta el próximo trigger (re-edit + retry, o `plugin.installed`
 * si admin re-toggle el plugin, o cron L3 reconcile).
 */
@Injectable()
export class SyncDefaultNameserversToEnhanceListener {
  private readonly logger = new Logger(
    SyncDefaultNameserversToEnhanceListener.name,
  );

  constructor(private readonly defaults: EnhanceDnsDefaultsService) {}

  @OnEvent('provisioning.default_nameservers_changed')
  async handle(payload: {
    newValue: readonly string[];
    oldValue: readonly string[];
    changedBy: string;
  }): Promise<void> {
    try {
      if (!Array.isArray(payload.newValue) || payload.newValue.length === 0) {
        this.logger.warn(
          `provisioning.default_nameservers_changed: newValue empty/invalid ` +
            `(${JSON.stringify(payload.newValue)}) — skipping cluster sync.`,
        );
        return;
      }

      const result = await this.defaults.applyClusterNameservers(
        payload.newValue,
      );

      this.logger.log(
        `provisioning.default_nameservers_changed (by=${payload.changedBy}): ` +
          `synced to Enhance C2 (added=${result.added.length}, ` +
          `preserved=${result.preserved.length}, stale=${result.stale.length}). ` +
          `NS=[${payload.newValue.join(', ')}]`,
      );

      if (result.stale.length > 0) {
        this.logger.warn(
          `Stale NS defaults remain in Enhance cluster (NOT deleted): ` +
            `[${result.stale.map((s) => s.value).join(', ')}]. ` +
            `Operador decide cuándo eliminarlos manualmente.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `sync-default-nameservers-to-enhance failed: ${getErrorMessage(err)} ` +
          `— Aelium setting already changed; Enhance cluster will be ` +
          `inconsistent until next trigger (cron L3 reconcile or admin retry).`,
      );
    }
  }
}

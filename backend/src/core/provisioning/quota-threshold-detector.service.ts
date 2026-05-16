import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, QuotaAlertKind, QuotaAlertResource } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { getErrorMessage } from '../common/utils/error.util';

import type { ServiceMetrics } from './types';

/**
 * Sprint 15C.II Fase F.8 (frozen 2026-05-16 — dossier §A.11.10.5.1 R1/R2/R5).
 *
 * Detector edge-triggered de alertas de cuota — heredable a todo plugin con
 * `has_metrics`. Vive en `core/provisioning/` (transversal) y se invoca al
 * final de cada pasada del cron L3 del plugin (Enhance:
 * `EnhanceReconciliationCron.runAsExecutor`; futuro 15E Docker / 15G Plesk
 * harán lo mismo en su cron). El servicio NO conoce qué plugin lo invoca —
 * recibe métricas + threshold y opera sobre la tabla `service_quota_alerts`.
 *
 * Patrón Prometheus/AlertManager:
 *
 *   1. M8 — no-op si `metrics.diskTotalMb` ausente o ≤ 0 (sin total no hay
 *      umbral; el plugin no reporta cuota dura para este servicio).
 *
 *   2. `pct = (diskUsedMb / diskTotalMb) * 100`.
 *
 *   3. M4 — `pct >= threshold` (umbral INCLUSIVO; LE / industry standard
 *      ACME-alerting). Si la última fila para `(service_id, resource='disk')`
 *      es `null` o `kind='crossed_down'`, transición → insertar `crossed_up`
 *      + emitir `service.quota_threshold_crossed`.
 *
 *   4. `pct < threshold` y última fila `kind='crossed_up'` → insertar
 *      `crossed_down` (solo state-tracking, sin emit). La próxima vez que
 *      vuelva above se considerará transición real → email nuevo.
 *
 *   5. Resto de casos → no-op (idempotente).
 *
 * **M2 — Idempotency operativa**: el par `findFirst` + `create` ocurre en
 * `$transaction` con isolation `Serializable`. Aunque el cron NO tiene
 * concurrencia natural (`@Cron` singleton Nest), un `runOnce()` manual
 * concurrente con la pasada programada podría causar doble emit; el lock
 * lo previene. **Grado profesional** — defensa explícita.
 *
 * **R7 — Degradación elegante**: el `emit` del evento ocurre FUERA de la
 * transacción. Si el dispatch a la cola BullMQ falla por presión del broker,
 * la fila `ServiceQuotaAlert` ya capturó el estado y la siguiente pasada
 * NO re-emite por edge-trigger — el cliente pierde un email pero el sistema
 * NO se desincroniza.
 *
 * **R3 — Scope F.8 = solo disco**. `bandwidth` queda fuera por el reset
 * mensual que rompe el edge-trigger sin handler especial (promoción futura
 * F.8.x con la semántica del reset resuelta).
 */
@Injectable()
export class QuotaThresholdDetectorService {
  private readonly logger = new Logger(QuotaThresholdDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async detectAndNotify(input: {
    serviceId: string;
    userId: string;
    pluginSlug: string;
    metrics: ServiceMetrics;
    thresholdPct: number;
  }): Promise<QuotaDetectorResult> {
    const { serviceId, userId, pluginSlug, metrics, thresholdPct } = input;

    // M8 — no-op si el plugin no reporta cuota dura para este service.
    if (
      metrics.diskUsedMb === undefined ||
      metrics.diskTotalMb === undefined ||
      metrics.diskTotalMb <= 0
    ) {
      return { action: 'noop_no_total' };
    }

    const pct = (metrics.diskUsedMb / metrics.diskTotalMb) * 100;
    const aboveThreshold = pct >= thresholdPct; // M4 inclusive

    // M2 — Serializable: garantiza que dos detectores concurrentes no
    // inserten dos `crossed_up` consecutivos. Postgres aborta la 2ª tx
    // con conflict → Prisma la propaga como error y el caller (cron) la
    // captura en su try/catch + log (R7).
    let txOutcome: TxOutcome;
    try {
      txOutcome = await this.prisma.$transaction(
        async (tx) => {
          const last = await tx.serviceQuotaAlert.findFirst({
            where: { service_id: serviceId, resource: QuotaAlertResource.disk },
            orderBy: { detected_at: 'desc' },
            select: { kind: true },
          });

          if (
            aboveThreshold &&
            (last === null || last.kind === QuotaAlertKind.crossed_down)
          ) {
            await tx.serviceQuotaAlert.create({
              data: {
                service_id: serviceId,
                resource: QuotaAlertResource.disk,
                kind: QuotaAlertKind.crossed_up,
                used_pct: new Prisma.Decimal(pct.toFixed(2)),
                threshold_pct: new Prisma.Decimal(thresholdPct),
              },
            });
            return { kind: 'crossed_up' as const };
          }
          if (!aboveThreshold && last?.kind === QuotaAlertKind.crossed_up) {
            await tx.serviceQuotaAlert.create({
              data: {
                service_id: serviceId,
                resource: QuotaAlertResource.disk,
                kind: QuotaAlertKind.crossed_down,
                used_pct: new Prisma.Decimal(pct.toFixed(2)),
                threshold_pct: new Prisma.Decimal(thresholdPct),
              },
            });
            return { kind: 'crossed_down' as const };
          }
          return { kind: 'no_transition' as const };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (err) {
      // Serialization failure (Postgres SQLSTATE 40001) o cualquier otro
      // error de la tx. Loguear sin relanzar — la siguiente pasada del
      // cron (6h después) recalculará el estado correctamente.
      this.logger.error(
        `quota detect service=${serviceId} resource=disk failed: ${getErrorMessage(err)}`,
      );
      return { action: 'tx_failed' };
    }

    if (txOutcome.kind === 'crossed_up') {
      // Emit FUERA de la tx (R7). Si el emit falla a su vez, lo logueamos
      // y NO relanzamos — la fila `crossed_up` ya está persistida; el
      // cliente pierde un email pero el sistema no se desincroniza.
      try {
        this.events.emit('service.quota_threshold_crossed', {
          service_id: serviceId,
          user_id: userId,
          plugin_slug: pluginSlug,
          resource: 'disk' as const,
          used_pct: Math.round(pct * 100) / 100,
          threshold_pct: thresholdPct,
          used_mb: metrics.diskUsedMb,
          total_mb: metrics.diskTotalMb,
          detected_at: new Date().toISOString(),
        });
      } catch (err) {
        this.logger.error(
          `quota emit service=${serviceId} failed (state persisted): ${getErrorMessage(err)}`,
        );
      }
    }

    return { action: txOutcome.kind, pct };
  }
}

type TxOutcome = { kind: 'crossed_up' | 'crossed_down' | 'no_transition' };

export interface QuotaDetectorResult {
  /**
   * - `noop_no_total`: el plugin no reporta total de disco → no hay umbral.
   * - `crossed_up`: transición `<threshold → ≥threshold` → emit despachado.
   * - `crossed_down`: transición `≥threshold → <threshold` → solo state.
   * - `no_transition`: la lectura confirma el último estado conocido.
   * - `tx_failed`: la transacción falló (conflict serializable u otro);
   *   la próxima pasada del cron recalculará.
   */
  action:
    | 'noop_no_total'
    | 'crossed_up'
    | 'crossed_down'
    | 'no_transition'
    | 'tx_failed';
  pct?: number;
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Service, ServiceStatus } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { ProvisionerPluginError } from '../../../../core/provisioning/types';
import type {
  ServiceInfoStatus,
  ServiceMetrics,
} from '../../../../core/provisioning/types';
import { QuotaThresholdDetectorService } from '../../../../core/provisioning/quota-threshold-detector.service';
import { ReconcileRegistryService } from '../../../../core/provisioning/reconcile-registry.service';
import type { ReconcileResult } from '../../../../core/provisioning/reconcile-registry.service';
import { getErrorMessage } from '../../../../core/common/utils/error.util';

import { EnhanceProvisionerPlugin } from '../enhance.plugin';

/**
 * Sprint 15C Fase 15C.H (2026-05-09) — `EnhanceReconciliationCron`.
 *
 * Materializa [ADR-083 §6 decisión 24](docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md#6-reconciliation-3-capas-decisiones-22-24)
 * — capa L3 del modelo de reconciliación 3 capas (L1 Redis 60s + L2
 * on-demand sin cache + L3 cron 6h). DH-INV-6 (ADR-082): en conflicto
 * operacional, **Enhance gana** — el cron actualiza Aelium, no al revés.
 *
 * Doctrina (ambigüedades resueltas Fase 15C.H pre-codear, 2026-05-09):
 *
 *   A1 — Schedule: `@Cron(EVERY_6_HOURS)` estático (patrón canónico
 *        consistente con `AuditRetentionCron`, `NotificationsRetentionCron`).
 *        El campo `manifest.configSchema.reconciliationIntervalHours`
 *        queda como documentación del intervalo aspiracional — cambiarlo
 *        requiere redeploy. Aceptable en v1: este cron es una alerta
 *        operativa, no un SLA externo.
 *
 *   A2 — `status_divergence`: Aelium **adopta automáticamente** el estado
 *        Enhance + emit evento + audit pesado deja trazabilidad. DH-INV-6
 *        literal. Sólo adoptamos cuando el mapped status es `active` o
 *        `suspended` (los dos estados con los que el cron filtra services
 *        en la query). Si Enhance reporta `cancelled`/`expired`/`failed`/
 *        `unknown`, emitimos sin update — el flujo de cancellation tiene
 *        side-effects (cancelled_at, cancellation_reason, billing) que NO
 *        debe pisar este cron de baja frecuencia.
 *
 *   A4 — `plan_divergence`: comparamos `Subscription.planId` (Enhance) vs
 *        `service.metadata.enhance_plan_id` (snapshot Aelium-side, escrito
 *        en `provision()` y mantenido por `actionChangePackage`). NO contra
 *        `Product.provisioner_config.enhance_plan_id` (default catálogo) —
 *        ese es el plan inicial del producto, no el plan asignado a este
 *        servicio concreto. Comparar contra catálogo generaría alertas
 *        espurias cada vez que un admin cambia el default del producto.
 *
 * Acceso al API client (acoplamiento aceptable plugin-internal):
 *   El cron vive en `enhance_cp/crons/` — código del propio módulo plugin —
 *   por tanto invoca directamente `plugin.getApiClient()` sin pasar por el
 *   contrato canónico ADR-077. Es legítimo: el contrato genérico
 *   `getStatus()` sólo devuelve `{status, statusReason, checkedAt}` y no
 *   expone `planId`, mientras que el cron necesita comparar planId también.
 *   Hacer una sola llamada `api.getSubscription` cubre las 3 detecciones.
 *   Mismo patrón que `EnhanceDnsDefaultsService` (Fase D) que también
 *   inyecta `EnhanceProvisionerPlugin` para reutilizar el client cacheado.
 *
 * Eventos emitidos (canónico ADR-083 §6):
 *   `service.reconciled_external_change` con shape:
 *     { service_id, user_id, plugin_slug: 'enhance_cp',
 *       change_type: 'subscription_missing' | 'status_divergence' | 'plan_divergence',
 *       expected, actual, detected_at }
 *
 *   Los listeners viven en sus módulos canónicos:
 *     - `AuditOnServiceReconciledExternalChangeListener`
 *       (`modules/audit/`) → persiste en `audit_change_log` con flag GDPR.
 *     - `NotificationsOnReconciliationThresholdExceededListener`
 *       (`modules/notifications/listeners/`) → SQL count + dispatchToSuperadmins.
 */
@Injectable()
export class EnhanceReconciliationCron implements OnModuleInit {
  private readonly logger = new Logger(EnhanceReconciliationCron.name);

  /**
   * Intervalo del cron — fuente de verdad única. `EVERY_6_HOURS` ⇒ ticks a
   * las 00/06/12/18 UTC, alineados a múltiplos de 6h desde epoch. Se
   * declara también al registry (`onModuleInit`) para que el admin overview
   * (Fase F.2) calcule "próxima reconciliación".
   */
  private static readonly INTERVAL_SECONDS = 6 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plugin: EnhanceProvisionerPlugin,
    private readonly events: EventEmitter2,
    private readonly reconcileRegistry: ReconcileRegistryService,
    // Sprint 15C.II Fase F.8 (dossier §A.11.10.5.1 R2 frozen 2026-05-16):
    // tras cada pasada del cron L3, una pasada adicional dedicada a la
    // detección edge-triggered de cuota de disco. El detector vive en
    // `core/provisioning/` (transversal) y se invoca per-service tras
    // leer las métricas frescas vía `api.calculateResourceUsage`.
    private readonly quotaDetector: QuotaThresholdDetectorService,
  ) {}

  /**
   * Sprint 15C.II Fase B (ADR-083 Amendment A4.2): registra el executor
   * canónico de reconciliation para el slug `enhance_cp` en el registry
   * global. Esto permite al admin endpoint
   * `POST /api/v1/admin/plugins/enhance_cp/reconcile-all` invocar el
   * mismo pipeline que el cron @Cron(EVERY_6_HOURS) sin tener que
   * importar este servicio directamente desde admin-plugins (R4).
   *
   * El executor envuelve `runOnce()` adaptando `ReconciliationSummary`
   * → `ReconcileResult` (shape canónico genérico) + mide duración.
   * Declara también `intervalSeconds` al registry para el admin overview.
   */
  onModuleInit(): void {
    this.reconcileRegistry.register('enhance_cp', () => this.runAsExecutor(), {
      intervalSeconds: EnhanceReconciliationCron.INTERVAL_SECONDS,
    });
  }

  /**
   * Versión "executor" de runOnce: devuelve `ReconcileResult` normalizado
   * en lugar de `ReconciliationSummary` específico del plugin. Heredable
   * por el patrón canónico Aelium reconcile (15D RC + 15E + 15G).
   */
  private async runAsExecutor(): Promise<ReconcileResult> {
    const startedAt = Date.now();
    const summary = await this.runOnce();
    // Sprint 15C.II Fase F.8: detección edge-triggered de cuota de disco.
    // Pasada adicional tras la reconciliación de drift — usa su propia
    // query Prisma + endpoint API `calculateResourceUsage` (no reusa
    // `getServiceInfo` que dispararía 5 calls por service; aquí solo nos
    // interesa el disco — más lean). Fail-soft: si un service falla, los
    // demás siguen + la próxima pasada (6h) reintenta. NO relanza al
    // caller para no marcar la reconciliación como fallida por F.8.
    await this.detectQuotaThresholds();
    const durationMs = Date.now() - startedAt;
    this.emitReconcileCompleted('manual', summary, durationMs);
    const driftsDetected =
      summary.subscriptionMissing +
      summary.statusDivergence +
      summary.planDivergence;
    return {
      servicesProcessed: summary.servicesChecked,
      driftsDetected,
      durationMs,
      details: {
        subscription_missing: summary.subscriptionMissing,
        status_divergence: summary.statusDivergence,
        plan_divergence: summary.planDivergence,
        errors: summary.errors,
      },
    };
  }

  /**
   * Sprint 15C.II Fase F.2 — emite el rollup `plugin.reconcile_completed`
   * (shape genérico, plugin-agnóstico) tras cada pasada (cron o manual).
   * Consumido por `AuditOnPluginReconcileCompletedListener` (modules/audit/)
   * → 1 fila `audit_change_log` con `entity_type='Plugin'`,
   * `action='reconcile_completed'`. El admin overview lee la más reciente
   * para mostrar "última reconciliación hace Xh". NO se relanza si el emit
   * falla — el cron debe seguir vivo (R7).
   */
  private emitReconcileCompleted(
    trigger: 'cron' | 'manual',
    summary: ReconciliationSummary,
    durationMs: number,
  ): void {
    this.events.emit('plugin.reconcile_completed', {
      plugin_slug: 'enhance_cp',
      trigger,
      services_processed: summary.servicesChecked,
      drifts_detected:
        summary.subscriptionMissing +
        summary.statusDivergence +
        summary.planDivergence,
      errors: summary.errors,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Ejecutado cada 6h. NO relanza errores — el cron debe seguir vivo
   * aunque una ejecución falle (R7 + patrón canónico cron retention).
   * Por servicio: try/catch individual para que un fallo en uno no
   * aborte el resto.
   */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'reconcileEnhanceServices',
    timeZone: 'UTC',
  })
  async handleScheduled(): Promise<void> {
    try {
      const startedAt = Date.now();
      const summary = await this.runOnce();
      this.emitReconcileCompleted('cron', summary, Date.now() - startedAt);
      this.logger.log(
        `reconcileEnhanceServices done: ` +
          `services=${summary.servicesChecked} ` +
          `subscription_missing=${summary.subscriptionMissing} ` +
          `status_divergence=${summary.statusDivergence} ` +
          `plan_divergence=${summary.planDivergence} ` +
          `errors=${summary.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `reconcileEnhanceServices failed at top level: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * Ejecuta una pasada de reconciliación. Público para permitir
   * trigger manual (smoke E2E, `runOnce()` desde admin endpoint
   * futuro) + tests deterministas sin esperar al schedule.
   */
  async runOnce(): Promise<ReconciliationSummary> {
    const services = await this.prisma.service.findMany({
      where: {
        provisioner_slug: 'enhance_cp',
        status: { in: ['active', 'suspended'] },
      },
      select: {
        id: true,
        user_id: true,
        status: true,
        provider_reference: true,
        metadata: true,
      },
    });

    const summary: ReconciliationSummary = {
      servicesChecked: services.length,
      subscriptionMissing: 0,
      statusDivergence: 0,
      planDivergence: 0,
      errors: 0,
    };

    for (const service of services) {
      try {
        const detected = await this.reconcileOne(service);
        if (detected === 'subscription_missing') summary.subscriptionMissing++;
        else if (detected === 'status_divergence') summary.statusDivergence++;
        else if (detected === 'plan_divergence') summary.planDivergence++;
      } catch (err) {
        summary.errors++;
        this.logger.error(
          `reconcileOne service=${service.id} failed: ${getErrorMessage(err)}`,
        );
      }
    }

    return summary;
  }

  /**
   * Reconcilia un único servicio. Devuelve el `change_type` detectado
   * (o `null` si no hay drift). Los 3 tipos son mutuamente excluyentes
   * para una pasada: si la subscription falta, no comparamos status;
   * si status diverge, NO comparamos plan (el adopt de status ya generó
   * un evento — añadir plan_divergence en la misma pasada confundiría
   * al admin sobre la causa raíz). En la siguiente ejecución del cron,
   * si el plan sigue divergiendo, se emitirá entonces.
   */
  private async reconcileOne(
    service: ReconcileServiceRow,
  ): Promise<ReconcileChangeType | null> {
    const refs = extractServiceRefs(service);
    if (!refs) {
      this.logger.warn(
        `reconcileOne service=${service.id}: missing enhance refs in metadata — skipping`,
      );
      return null;
    }

    const { client: api } = await this.plugin.getApiClient();

    let subscription;
    try {
      subscription = await api.getSubscription(refs.orgId, refs.subscriptionId);
    } catch (err) {
      // 404 → subscription borrada externamente (drift más severo).
      if (
        err instanceof ProvisionerPluginError &&
        err.code === 'INVALID_STATE'
      ) {
        this.handleSubscriptionMissing(service);
        return 'subscription_missing';
      }
      throw err;
    }

    // status_divergence
    const enhanceStatus = mapSubscriptionStatusContract(subscription);
    const aeliumStatus = service.status;
    if (statusesDiverge(aeliumStatus, enhanceStatus)) {
      await this.handleStatusDivergence(service, aeliumStatus, enhanceStatus);
      return 'status_divergence';
    }

    // plan_divergence (compara contra metadata, NO contra product.provisioner_config — A4)
    const aeliumPlanId = extractAeliumPlanId(service);
    const enhancePlanId = subscription.planId;
    if (aeliumPlanId !== null && aeliumPlanId !== enhancePlanId) {
      this.emitChange(service, 'plan_divergence', aeliumPlanId, enhancePlanId);
      // NO auto-corrige Aelium — billing implication, admin decide.
      return 'plan_divergence';
    }

    return null;
  }

  // ─── Handlers por change_type ──────────────────────────────────────────

  private handleSubscriptionMissing(service: ReconcileServiceRow): void {
    // DH-INV-6 + dossier §6.10: NO marcamos 'cancelled' automático
    // (el flujo de cancellation tiene side-effects billing). Marcamos
    // 'unknown' equivalente vía `provisioner_data` (para no pisar el
    // enum Prisma — `unknown` no existe). En su lugar, marcamos audit
    // pesado y dejamos el status Aelium como estaba: el admin investiga.
    //
    // Nota técnica: el dossier dice "Aelium marca Service.status='unknown'"
    // pero el enum ServiceStatus Prisma NO tiene 'unknown'. Compromiso
    // canónico: emit audit + notificación pesada SIN tocar Service.status —
    // el admin lo verifica manualmente y decide cancelled vs reprovision.
    // Esta es la materialización pragmática de DH-INV-6 con el schema actual.
    this.emitChange(
      service,
      'subscription_missing',
      { status: service.status },
      { status: 'missing_in_provider' },
    );
    this.logger.warn(
      `reconcile service=${service.id}: subscription not found in Enhance — ` +
        `status NOT auto-modified (admin decision required). Audit + notif emitted.`,
    );
  }

  private async handleStatusDivergence(
    service: ReconcileServiceRow,
    aeliumStatus: ServiceStatus,
    enhanceStatus: ServiceInfoStatus,
  ): Promise<void> {
    const target = mapContractToPrismaStatus(enhanceStatus);
    if (target === null) {
      // Enhance reporta un status fuera del set adoptable (cancelled,
      // expired, failed, unknown). Emitimos sin update — admin decide.
      this.emitChange(
        service,
        'status_divergence',
        aeliumStatus,
        enhanceStatus,
      );
      this.logger.warn(
        `reconcile service=${service.id}: status divergence ` +
          `aelium=${aeliumStatus} enhance=${enhanceStatus} ` +
          `NOT adopted (out of safe-adopt set). Audit + notif emitted.`,
      );
      return;
    }
    // Adoptamos (DH-INV-6: Enhance gana).
    await this.prisma.service.update({
      where: { id: service.id },
      data: { status: target },
    });
    this.emitChange(service, 'status_divergence', aeliumStatus, target);
    this.logger.log(
      `reconcile service=${service.id}: status adopted ${aeliumStatus}→${target} (DH-INV-6)`,
    );
  }

  private emitChange(
    service: ReconcileServiceRow,
    change_type: ReconcileChangeType,
    expected: unknown,
    actual: unknown,
  ): void {
    this.events.emit('service.reconciled_external_change', {
      service_id: service.id,
      user_id: service.user_id,
      plugin_slug: 'enhance_cp',
      change_type,
      expected,
      actual,
      detected_at: new Date().toISOString(),
    });
  }

  // ─── F.8 — Detección edge-triggered de cuota de disco ──────────────────

  /**
   * Sprint 15C.II Fase F.8 (dossier §A.11.10.5.1 R2 frozen 2026-05-16).
   *
   * Pasada dedicada a la detección de cruce de cuota de disco. Se ejecuta
   * tras `runOnce()` en `runAsExecutor()` (cron + trigger manual admin).
   *
   *   1. Lee el threshold del manifest del plugin (`plugin_installs.config
   *      .quota_alert_threshold_pct`, default 85; R4).
   *   2. Itera services Enhance con status `active` (los suspendidos no
   *      consumen disco activamente — el cliente no podría liberar nada
   *      hasta unsuspender; YAGNI alert).
   *   3. Por cada service, lee métricas frescas vía
   *      `api.calculateResourceUsage(orgId, subscriptionId)` (PUT que
   *      pide a Enhance recalcular — más caro pero garantiza ground truth
   *      al momento de la pasada, mismo coste que el cron L3 acepta para
   *      drift detection).
   *   4. Compone `ServiceMetrics` mínimo (disco only — R3) y delega al
   *      detector transversal `QuotaThresholdDetectorService`.
   *
   * Fail-soft (R7): cada service en su try/catch; un fallo individual
   * NO aborta la pasada. La siguiente ejecución del cron (6h después)
   * reintentará. Cualquier excepción del top-level se traga + loguea.
   */
  private async detectQuotaThresholds(): Promise<void> {
    let thresholdPct: number;
    try {
      thresholdPct = await this.loadThresholdFromManifest();
    } catch (err) {
      this.logger.error(
        `quota threshold load failed (plugin install): ${getErrorMessage(err)}`,
      );
      return;
    }

    const services = await this.prisma.service.findMany({
      where: {
        provisioner_slug: 'enhance_cp',
        // `active` solo: los `suspended` no pueden actuar sobre la cuota
        // hasta unsuspender; alertarles sería ruido. Heredable.
        status: 'active',
      },
      // `status` se incluye porque `extractServiceRefs` (compartido con la
      // reconciliación principal) lo tipa como required en `ReconcileServiceRow`.
      select: {
        id: true,
        user_id: true,
        status: true,
        provider_reference: true,
        metadata: true,
      },
    });

    let processed = 0;
    let triggered = 0;
    let skipped = 0;
    let errors = 0;

    const { client: api } = await this.plugin.getApiClient();

    for (const service of services) {
      try {
        const refs = extractServiceRefs(service);
        if (!refs) {
          skipped++;
          continue;
        }
        const resources = await api.calculateResourceUsage(
          refs.orgId,
          refs.subscriptionId,
        );
        const metrics = buildQuotaMetrics(resources);
        if (metrics === null) {
          // Enhance no devolvió `disk` con `total` para este service —
          // tratado como no-op (el detector también haría no-op por M8,
          // pero saltamos antes para no contar como "processed").
          skipped++;
          continue;
        }
        const result = await this.quotaDetector.detectAndNotify({
          serviceId: service.id,
          userId: service.user_id,
          pluginSlug: 'enhance_cp',
          metrics,
          thresholdPct,
        });
        processed++;
        if (result.action === 'crossed_up') triggered++;
      } catch (err) {
        errors++;
        this.logger.error(
          `quota detect service=${service.id} failed: ${getErrorMessage(err)}`,
        );
      }
    }

    this.logger.log(
      `quotaThresholdDetect done: services=${services.length} ` +
        `processed=${processed} triggered=${triggered} ` +
        `skipped=${skipped} errors=${errors} threshold=${thresholdPct}%`,
    );
  }

  /**
   * Lee `quota_alert_threshold_pct` del install config (ADR-080 — manifest
   * declarativo persistido en `plugin_installs.config`). Defensa: si la
   * install no existe o el valor está fuera del rango canónico
   * `[50, 95]`, cae al default 85 (mismo que el `default` del manifest).
   * Esto cubre el caso edge del seed inicial sin admin edit + corrupción
   * defensiva (R12 / R7).
   */
  private async loadThresholdFromManifest(): Promise<number> {
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug: 'enhance_cp' },
      select: { config: true },
    });
    const raw = (install?.config as Record<string, unknown> | null)?.[
      'quota_alert_threshold_pct'
    ];
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 50 && raw <= 95) {
      return raw;
    }
    return 85;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F.8 — helpers file-private
// ────────────────────────────────────────────────────────────────────────────

interface EnhanceUsedResourcesItem {
  readonly name: string;
  readonly usage: number;
  readonly total?: number;
}

interface EnhanceUsedResourcesFullListing {
  readonly items: readonly EnhanceUsedResourcesItem[];
}

/**
 * F.8 — extrae disco de la respuesta `calculateResourceUsage`. Devuelve
 * `null` si Enhance no expone disco con total (sin cuota dura no hay
 * umbral — el detector también haría no-op por M8, pero esta pre-check
 * evita el round-trip a la BD).
 */
function buildQuotaMetrics(
  resources: EnhanceUsedResourcesFullListing,
): ServiceMetrics | null {
  for (const item of resources.items) {
    const lower = item.name.toLowerCase();
    if (lower === 'disk' || lower === 'diskspace') {
      if (item.total === undefined || item.total <= 0) return null;
      return {
        diskUsedMb: item.usage,
        diskTotalMb: item.total,
        fetchedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

export type ReconcileChangeType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

export interface ReconciliationSummary {
  servicesChecked: number;
  subscriptionMissing: number;
  statusDivergence: number;
  planDivergence: number;
  errors: number;
}

type ReconcileServiceRow = Pick<
  Service,
  'id' | 'user_id' | 'status' | 'provider_reference' | 'metadata'
>;

interface ServiceEnhanceRefs {
  readonly orgId: string;
  readonly subscriptionId: number;
}

function extractServiceRefs(
  service: ReconcileServiceRow,
): ServiceEnhanceRefs | null {
  const md = service.metadata as Record<string, unknown> | null | undefined;
  const orgId = md?.enhance_org_id;
  const ref = service.provider_reference;
  if (typeof orgId !== 'string' || orgId.length === 0) return null;
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const subscriptionId = Number(ref);
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) return null;
  return { orgId, subscriptionId };
}

function extractAeliumPlanId(service: ReconcileServiceRow): number | null {
  const md = service.metadata as Record<string, unknown> | null | undefined;
  const raw = md?.enhance_plan_id;
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0
    ? raw
    : null;
}

/**
 * Mapea EnhanceSubscription → ServiceInfoStatus (espejo de
 * `mapSubscriptionStatus` en `enhance.plugin.ts`). Duplicado intencional:
 * el cron NO importa la helper privada del plugin para evitar coupling
 * tight con archivo-internal. Si la lógica diverge, los tests del plugin
 * y del cron lo detectarán (ambos cubren el mapping).
 */
function mapSubscriptionStatusContract(sub: {
  status: string;
  suspendedBy?: string;
}): ServiceInfoStatus {
  if (sub.status === 'deleted') return 'cancelled';
  if (sub.suspendedBy && sub.suspendedBy.length > 0) return 'suspended';
  if (sub.status === 'active') return 'active';
  return 'unknown';
}

/**
 * Mapea ServiceInfoStatus (contrato genérico) → ServiceStatus (Prisma).
 * Sólo devuelve un valor para los estados "safe to adopt" automáticamente:
 * `active` y `suspended`. El resto requiere intervención admin
 * (cancelled/expired/failed/unknown) — devolvemos `null` y el caller
 * emite el evento sin actualizar.
 */
function mapContractToPrismaStatus(
  status: ServiceInfoStatus,
): ServiceStatus | null {
  if (status === 'active') return 'active';
  if (status === 'suspended') return 'suspended';
  return null;
}

function statusesDiverge(
  aelium: ServiceStatus,
  enhance: ServiceInfoStatus,
): boolean {
  if (aelium === 'active' && enhance === 'active') return false;
  if (aelium === 'suspended' && enhance === 'suspended') return false;
  return true;
}

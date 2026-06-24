import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, type Service } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { OutboxService } from '../../../../core/outbox/outbox.service';
import { ReconcileRegistryService } from '../../../../core/provisioning/reconcile-registry.service';
import type { ReconcileResult } from '../../../../core/provisioning/reconcile-registry.service';
import type {
  DomainInfo,
  ServiceWithRelations,
} from '../../../../core/provisioning/types';
import { getErrorMessage } from '../../../../core/common/utils/error.util';

import { ResellerclubProvisionerPlugin } from '../resellerclub.plugin';

/**
 * Sprint 15D Fase 15D.E — `ResellerclubReconciliationCron`.
 *
 * Capa L3 del modelo de reconciliación (patrón `EnhanceReconciliationCron`,
 * ADR-083 §6) para el registrar de dominios. DH-INV-6 ([ADR-082](docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)):
 * en conflicto operacional **el registrar gana** — el cron actualiza Aelium.
 *
 * Cada 6h, por cada servicio de dominio (`provisioner_slug='resellerclub'`,
 * status `active`/`suspended`):
 *
 *   1. **Puebla `services.expires_at`** desde la expiración real del registrar
 *      (ADR-082 A2.3 — `expires_at` first-class; lo consume el cron de avisos).
 *   2. **Lifecycle edge-triggered**: compara el `lifecycle` del registrar
 *      (`active`/`expired`/`redemption`/`pending_delete`) con el último persistido
 *      en `services.metadata.domain_lifecycle`. En la transición a `expired` →
 *      `domain.expired`; a `redemption`/`pending_delete` → `domain.entered_redemption`
 *      (ambos vía **Outbox**, R8 + ADR-084 §5). No re-emite mientras no cambie.
 *   3. **Safe-adopt de status** (DH-INV-6): solo adopta `active`↔`suspended`
 *      sobre `services.status`. NUNCA escribe `expired` (no existe en el enum
 *      `ServiceStatus` — es estado OPERACIONAL vía `getServiceInfo`, A2.3).
 *
 * Reutiliza `plugin.getServiceInfo(service)` (método de contrato público,
 * ADR-077): una sola lectura `domains/details` alimenta status + `DomainInfo`
 * (lifecycle + expiresAt), sin acoplarse a helpers internos del plugin. Si RC
 * está caído, `getServiceInfo` devuelve `status='unknown'` y OMITE `domain` →
 * el cron salta ese servicio (fail-soft, R7); la próxima pasada reintenta.
 *
 * Heredable: registra su executor reconcile-all en `ReconcileRegistryService`
 * (`onModuleInit`) para el botón admin "reconciliar ahora" (Fase 15D.F).
 */
@Injectable()
export class ResellerclubReconciliationCron implements OnModuleInit {
  private readonly logger = new Logger(ResellerclubReconciliationCron.name);

  private static readonly SLUG = 'resellerclub';
  private static readonly INTERVAL_SECONDS = 6 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plugin: ResellerclubProvisionerPlugin,
    private readonly outbox: OutboxService,
    private readonly reconcileRegistry: ReconcileRegistryService,
  ) {}

  onModuleInit(): void {
    this.reconcileRegistry.register(
      ResellerclubReconciliationCron.SLUG,
      () => this.runAsExecutor(),
      { intervalSeconds: ResellerclubReconciliationCron.INTERVAL_SECONDS },
    );
  }

  /**
   * Ejecutado cada 6h. NO relanza — el cron debe seguir vivo aunque una pasada
   * falle (R7, patrón canónico de cron). Por servicio: try/catch individual.
   */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'reconcileResellerclubDomains',
    timeZone: 'UTC',
  })
  async handleScheduled(): Promise<void> {
    try {
      const summary = await this.runOnce();
      this.logger.log(
        `reconcileResellerclubDomains done: services=${summary.servicesChecked} ` +
          `expires_updated=${summary.expiresAtUpdated} ` +
          `lifecycle_transitions=${summary.lifecycleTransitions} ` +
          `status_adopted=${summary.statusAdopted} ` +
          `transfers_completed=${summary.transfersCompleted} ` +
          `transfers_failed=${summary.transfersFailed} errors=${summary.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `reconcileResellerclubDomains failed at top level: ${getErrorMessage(err)}`,
      );
    }
  }

  /** Versión "executor" (shape `ReconcileResult` normalizado) para el registry. */
  private async runAsExecutor(): Promise<ReconcileResult> {
    const startedAt = Date.now();
    const summary = await this.runOnce();
    return {
      servicesProcessed: summary.servicesChecked,
      driftsDetected:
        summary.lifecycleTransitions +
        summary.statusAdopted +
        summary.transfersCompleted +
        summary.transfersFailed,
      durationMs: Date.now() - startedAt,
      details: {
        expires_at_updated: summary.expiresAtUpdated,
        lifecycle_transitions: summary.lifecycleTransitions,
        status_adopted: summary.statusAdopted,
        transfers_completed: summary.transfersCompleted,
        transfers_failed: summary.transfersFailed,
        errors: summary.errors,
      },
    };
  }

  /**
   * Una pasada. Público para trigger manual (admin "reconciliar ahora") + tests
   * deterministas sin esperar al schedule.
   */
  async runOnce(): Promise<ResellerclubReconciliationSummary> {
    const services = await this.prisma.service.findMany({
      where: {
        provisioner_slug: ResellerclubReconciliationCron.SLUG,
        OR: [
          // Lifecycle: dominios activos/suspendidos (expires_at + estado).
          { status: { in: ['active', 'suspended'] } },
          // 15D.II.T2b — motor de la FSM de transfer: un transfer en curso vive en
          // `provisioning` con `transfer_state='submitted'` → avanzarlo aquí.
          {
            status: 'provisioning',
            metadata: { path: ['transfer_state'], equals: 'submitted' },
          },
        ],
      },
      select: {
        id: true,
        user_id: true,
        status: true,
        domain: true,
        label: true,
        provider_reference: true,
        expires_at: true,
        metadata: true,
      },
    });

    const summary: ResellerclubReconciliationSummary = {
      servicesChecked: services.length,
      expiresAtUpdated: 0,
      lifecycleTransitions: 0,
      statusAdopted: 0,
      transfersCompleted: 0,
      transfersFailed: 0,
      errors: 0,
    };

    for (const service of services) {
      try {
        await this.reconcileOne(service, summary);
      } catch (err) {
        summary.errors++;
        this.logger.error(
          `reconcileOne service=${service.id} failed: ${getErrorMessage(err)}`,
        );
      }
    }
    return summary;
  }

  private async reconcileOne(
    service: ReconcileDomainRow,
    summary: ResellerclubReconciliationSummary,
  ): Promise<void> {
    if (!service.provider_reference) return; // aún no aprovisionado

    // 15D.II.T2b — un transfer en curso se avanza por su FSM (motor), NO por el
    // lifecycle de expiración (su `getServiceInfo` diría 'active' engañosamente
    // mientras el registrar aún lo procesa).
    if (readTransferState(service.metadata) === 'submitted') {
      await this.advanceTransfer(service, summary);
      return;
    }

    // Una sola lectura `domains/details` vía el contrato (status + DomainInfo).
    const info = await this.plugin.getServiceInfo(toMinimalService(service));
    if (!info.domain) {
      // RC inaccesible / sin datos → no afirmar nada (fail-soft); reintenta en 6h.
      this.logger.debug(
        `reconcileOne service=${service.id}: sin DomainInfo (RC inaccesible) — skip.`,
      );
      return;
    }

    const newLifecycle = info.domain.lifecycle;
    const prevLifecycle = readLifecycle(service.metadata);
    const newExpiresAt = parseIsoDate(info.domain.expiresAt);
    const newNameservers = [...info.domain.nameservers];
    const expiresChanged = !sameInstant(newExpiresAt, service.expires_at);
    const lifecycleChanged = newLifecycle !== prevLifecycle;
    // DH-INV-6: el registrar gana — adoptamos los NS reales (un cambio manual o
    // externo de delegación se refleja aquí). `metadata.nameservers` es la clave
    // que lee el `dns-authority-resolver` (ADR-082 §6) y la que el listener
    // `switch-domain-ns-on-hosting-activated` (A3) usa para saber si un dominio
    // sigue "aparcado". Solo escribimos si cambia (evita churn cada 6h).
    const nsChanged = !sameNameservers(
      newNameservers,
      readNameservers(service.metadata),
    );
    const adoptStatus = safeAdoptStatus(service.status, info.status);

    if (
      !expiresChanged &&
      !lifecycleChanged &&
      !nsChanged &&
      adoptStatus === null
    ) {
      return; // sin cambios → no escribir (evita churn cada 6h)
    }

    const nextMetadata = {
      ...toObject(service.metadata),
      domain_lifecycle: newLifecycle,
      nameservers: newNameservers,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: service.id },
        data: {
          ...(expiresChanged ? { expires_at: newExpiresAt } : {}),
          ...(adoptStatus !== null ? { status: adoptStatus } : {}),
          metadata: nextMetadata as Prisma.InputJsonValue,
        },
      });

      // Edge-trigger: emite SOLO en la transición de lifecycle (R8, Outbox).
      if (lifecycleChanged) {
        const eventType = lifecycleEvent(newLifecycle);
        if (eventType) {
          await this.outbox.enqueue(tx, eventType, {
            service_id: service.id,
            user_id: service.user_id,
            fqdn: service.domain,
          });
          summary.lifecycleTransitions++;
          this.logger.log(
            `reconcileOne service=${service.id}: lifecycle ${prevLifecycle ?? 'none'}` +
              `→${newLifecycle} → ${eventType} (Outbox).`,
          );
        }
      }
    });

    if (expiresChanged) summary.expiresAtUpdated++;
    if (adoptStatus !== null) {
      summary.statusAdopted++;
      this.logger.log(
        `reconcileOne service=${service.id}: status adoptado ${service.status}` +
          `→${adoptStatus} (DH-INV-6).`,
      );
    }
  }

  /**
   * 15D.II.T2b — motor de la FSM de transfer-in. Lee el estado real en el registrar
   * (`getTransferStatus`, DH-INV-6) y avanza un transfer `submitted`:
   *   - `completed` → el dominio pasa a registro normal: status `active` +
   *     `expires_at` poblado + NS adoptados + cierra la FSM (`transfer_state='completed'`).
   *   - `failed`/`cancelled` → cierra la FSM (status se mantiene; la notificación
   *     al cliente + la opción de reintento son T3).
   *   - `submitted`/`unknown` → sin cambios (sigue en curso / RC caído, fail-soft R7).
   *
   * **Cobro al completar** (generar la factura del transfer en `completed`,
   * [ADR-084 A2.3](docs/10-decisions/adr-084-comercio-dominios-registrar.md)) +
   * el evento `domain.transfer_completed` (zona DNS) se materializan en **T2c/T3**.
   */
  private async advanceTransfer(
    service: ReconcileDomainRow,
    summary: ResellerclubReconciliationSummary,
  ): Promise<void> {
    const state = await this.plugin.getTransferStatus(
      toMinimalService(service),
    );
    if (state === 'submitted' || state === 'unknown') return; // en curso / RC caído

    if (state === 'completed') {
      const info = await this.plugin.getServiceInfo(toMinimalService(service));
      const newExpiresAt = parseIsoDate(info.domain?.expiresAt);
      const newNameservers = info.domain ? [...info.domain.nameservers] : null;
      await this.prisma.$transaction(async (tx) => {
        await tx.service.update({
          where: { id: service.id },
          data: {
            status: 'active',
            ...(newExpiresAt ? { expires_at: newExpiresAt } : {}),
            metadata: {
              ...toObject(service.metadata),
              transfer_state: 'completed',
              ...(newNameservers ? { nameservers: newNameservers } : {}),
            } as Prisma.InputJsonValue,
          },
        });
        // Cobro al completar (factura) + zona DNS (T3): los consumen los
        // listeners de `domain.transfer_completed` (Outbox, R8 + ADR-084 A2.3).
        // El evento se persiste en la MISMA tx que la activación (exactly-once).
        await this.outbox.enqueue(tx, 'domain.transfer_completed', {
          service_id: service.id,
          user_id: service.user_id,
          fqdn: service.domain,
          expires_at: newExpiresAt ? newExpiresAt.toISOString() : null,
        });
      });
      summary.transfersCompleted++;
      this.logger.log(
        `advanceTransfer service=${service.id}: transfer COMPLETED → active ` +
          `(expires_at=${newExpiresAt?.toISOString() ?? 'n/a'}) + domain.transfer_completed (Outbox).`,
      );
      return;
    }

    // failed / cancelled → cierra la FSM (status se mantiene; T3 notifica).
    await this.prisma.service.update({
      where: { id: service.id },
      data: {
        metadata: {
          ...toObject(service.metadata),
          transfer_state: state,
        } as Prisma.InputJsonValue,
      },
    });
    summary.transfersFailed++;
    this.logger.warn(
      `advanceTransfer service=${service.id}: transfer ${state.toUpperCase()} ` +
        `(FSM cerrada; notificación + reintento = T3/cliente).`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

export interface ResellerclubReconciliationSummary {
  servicesChecked: number;
  expiresAtUpdated: number;
  lifecycleTransitions: number;
  statusAdopted: number;
  /** 15D.II.T2b — transfers avanzados a `completed` (→ active). */
  transfersCompleted: number;
  /** 15D.II.T2b — transfers avanzados a `failed`/`cancelled`. */
  transfersFailed: number;
  errors: number;
}

type ReconcileDomainRow = Pick<
  Service,
  | 'id'
  | 'user_id'
  | 'status'
  | 'domain'
  | 'label'
  | 'provider_reference'
  | 'expires_at'
  | 'metadata'
>;

/** Service mínimo para `getServiceInfo` (solo lee provider_reference/domain/label). */
function toMinimalService(service: ReconcileDomainRow): ServiceWithRelations {
  return {
    id: service.id,
    domain: service.domain,
    label: service.label,
    provider_reference: service.provider_reference,
    metadata: service.metadata,
  } as unknown as ServiceWithRelations;
}

/** Evento Outbox de la transición de lifecycle (ADR-084 §5). Null si no aplica. */
function lifecycleEvent(
  lifecycle: DomainInfo['lifecycle'],
): 'domain.expired' | 'domain.entered_redemption' | null {
  if (lifecycle === 'expired') return 'domain.expired';
  if (lifecycle === 'redemption' || lifecycle === 'pending_delete') {
    return 'domain.entered_redemption';
  }
  return null; // 'active' → sin evento
}

/**
 * Safe-adopt (DH-INV-6): solo adopta `active`↔`suspended`. Devuelve el nuevo
 * status si hay que adoptarlo, o `null` si no se toca (incluye `expired`/
 * `unknown`/… → estado OPERACIONAL vía getServiceInfo, NO el enum — ADR-082 A2.3).
 */
function safeAdoptStatus(
  current: Service['status'],
  providerStatus: string,
): Service['status'] | null {
  if (providerStatus === 'active' && current !== 'active') return 'active';
  if (providerStatus === 'suspended' && current !== 'suspended') {
    return 'suspended';
  }
  return null;
}

function readLifecycle(metadata: unknown): string | null {
  const v = toObject(metadata).domain_lifecycle;
  return typeof v === 'string' ? v : null;
}

/** Lee `metadata.transfer_state` (FSM de transfer-in, 15D.II.T2). */
function readTransferState(metadata: unknown): string | null {
  const v = toObject(metadata).transfer_state;
  return typeof v === 'string' ? v : null;
}

/** Lee `metadata.nameservers` (array de strings) defensivamente. */
function readNameservers(metadata: unknown): string[] {
  const v = toObject(metadata).nameservers;
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
}

/** Compara dos sets de NS ignorando case + orden + trailing dot. */
function sameNameservers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (s: string): string => s.replace(/\.$/, '').toLowerCase().trim();
  const sa = [...a].map(norm).sort();
  const sb = [...b].map(norm).sort();
  return sa.every((x, i) => x === sb[i]);
}

function toObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function parseIsoDate(raw: string | undefined): Date | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

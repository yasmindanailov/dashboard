import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import {
  ProvisionContext,
  ProvisionerPluginError,
  ProvisioningFollowUp,
  ServiceWithRelations,
} from '../../core/provisioning/types';
import { TasksService } from '../tasks/tasks.service';
import { calculateTaskPriority } from '../../core/tasks/priority-helper';
import { calculateTaskDueDate } from '../../core/tasks/sla-helper';
import { autoAssignTask } from '../../core/tasks/auto-assign';

export const PROVISIONING_DISPATCH_QUEUE = 'provisioning-dispatch';
export const PROVISIONING_DISPATCH_JOB = 'provision-service';

/**
 * Sprint 11 Fase 11.B (2026-05-01) — Orquestador de provisioning.
 *
 * Responsabilidades canónicas (ADR-077 + ADR-070 + ADR-021):
 *  1. Escuchar `invoice.paid` (emitido por `BillingPaymentService` vía Outbox).
 *  2. Para cada `service` de la factura, encolar job en `provisioning-dispatch`.
 *  3. Resolver el plugin por `service.product.provisioner` desde el registry.
 *  4. Construir `ProvisionContext` + invocar `plugin.provision()`.
 *  5. Persistir `provider_reference` + `provisioner_slug` denormalizado +
 *     `metadata` resultantes.
 *  6. Procesar `followUp` (`mark_active` / `wait_for_task_completion` /
 *     `create_setup_task`).
 *  7. Emitir `service.activated` cuando el servicio queda `active`.
 *  8. Si el plugin falla con `retriable=true`: lanzar para que BullMQ
 *     reintente con backoff exponencial.
 *  9. Si falla con `retriable=false`: persistir `service.status='cancelled'`
 *     + emitir `service.provisioning_failed` (consumido por notifications →
 *     alerta admin).
 *
 * Decisión local de Sprint 11 — coexistencia con `service.provisioned`:
 *   `BillingCheckoutService` emite `service.provisioned` al CREAR el service
 *   (Sprint 8 D.12.9 — el listener `SupportInsideOnServiceProvisionedListener`
 *   lo consume). Para preservar compatibilidad SIN romper Sprint 8, este
 *   orquestador emite un evento NUEVO `service.activated` cuando el
 *   provisioning REAL termina con éxito y el servicio pasa a `status='active'`.
 *   Plugins reales de Sprint 15 deben consumir `service.activated`, no
 *   `service.provisioned`.
 */
@Injectable()
export class ProvisioningOrchestratorService {
  private readonly logger = new Logger(ProvisioningOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
    private readonly tasks: TasksService,
    private readonly events: EventEmitter2,
    @InjectQueue(PROVISIONING_DISPATCH_QUEUE) private readonly queue: Queue,
    // Sprint 15C.II Fase C round 3 (smoke real Yasmin 2026-05-10): el
    // wrapper `getServiceInfoWithCache` cachea el resultado del plugin
    // por 60s. Tras `provision()` exitoso, la metadata recién persistida
    // (enhance_org_id, provider_reference) NO se reflejaba en la UI
    // porque el wrapper devolvía la versión cacheada `not_yet_provisioned`
    // de antes del provision. Bug crítico de UX que invalidaba el botón
    // "Re-aprovisionar ahora" — el admin pulsaba, plugin OK, UI seguía
    // mostrando drift. Fix: invalidar cache canónicamente tras cualquier
    // mutación de service (provision OK + provision permanent failure +
    // markActive). Análogo al patrón
    // `executeActionWithCacheInvalidation` (plugin-utils.ts:289).
    private readonly cache: ProvisioningCacheService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // 1. Trigger: invoice.paid → encolar provisioning de cada service
  // ──────────────────────────────────────────────────────────────────────

  @OnEvent('invoice.paid')
  async handleInvoicePaid(payload: {
    invoice_id: string;
    user_id: string;
  }): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payload.invoice_id },
      include: { items: { select: { service_id: true } } },
    });

    if (!invoice) {
      this.logger.warn(
        `invoice.paid received for unknown invoice ${payload.invoice_id}; skipping.`,
      );
      return;
    }

    const serviceIds = [
      ...new Set(
        invoice.items
          .map((it) => it.service_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (serviceIds.length === 0) {
      this.logger.debug(
        `invoice.paid ${invoice.id}: no service items, nothing to provision.`,
      );
      return;
    }

    for (const serviceId of serviceIds) {
      await this.enqueueProvisioning(serviceId, randomUUID());
    }
  }

  /**
   * Enqueue manual (usado por endpoint admin `/admin/services/:id/reprovision`
   * + tests). Genera correlationId si no se pasa.
   */
  async enqueueProvisioning(
    serviceId: string,
    correlationId: string = randomUUID(),
  ): Promise<void> {
    await this.queue.add(
      PROVISIONING_DISPATCH_JOB,
      { service_id: serviceId, correlation_id: correlationId },
      {
        jobId: `provision-${serviceId}-${correlationId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    );
    this.logger.log(
      `Enqueued provisioning for service ${serviceId} (correlation=${correlationId}).`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. Worker entry point: invocado por ProvisioningDispatchProcessor
  // ──────────────────────────────────────────────────────────────────────

  async provisionService(
    serviceId: string,
    correlationId: string,
  ): Promise<void> {
    const service = await this.loadServiceWithRelations(serviceId);

    if (!service) {
      this.logger.warn(
        `Provisioning skipped for service ${serviceId}: not found.`,
      );
      return;
    }

    if (service.status === 'cancelled' || service.status === 'terminated') {
      this.logger.warn(
        `Provisioning skipped for service ${serviceId}: status="${service.status}" (terminal).`,
      );
      return;
    }

    if (service.status === 'active') {
      this.logger.debug(
        `Provisioning skipped for service ${serviceId}: already active (idempotent).`,
      );
      return;
    }

    const pluginSlug = service.product.provisioner;
    const plugin = this.registry.get(pluginSlug);

    if (!plugin) {
      this.logger.error(
        `Plugin "${pluginSlug}" not registered. Service ${serviceId} stays in pending.`,
      );
      this.events.emit('service.provisioning_failed', {
        service_id: serviceId,
        user_id: service.user_id,
        provisioner_slug: pluginSlug,
        reason: 'plugin_not_registered',
        correlation_id: correlationId,
      });
      return;
    }

    // Marcar status='provisioning' para visibilidad UI mientras dura el plugin call.
    await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        status: 'provisioning',
        provisioner_slug: pluginSlug,
      },
    });

    const ctx: ProvisionContext = {
      service,
      client: service.client,
      productConfig:
        (service.product.provisioner_config as Record<string, unknown>) ?? {},
      serverId: service.server_id ?? null,
      correlationId,
    };

    try {
      const result = await plugin.provision(ctx);

      await this.prisma.service.update({
        where: { id: serviceId },
        data: {
          provider_reference: result.providerReference,
          metadata: result.metadata as Prisma.InputJsonValue,
        },
      });

      // Sprint 15C.II Fase C round 3 — invalidar cache `service_info:${id}`
      // tras persistir nueva metadata. Sin esto el wrapper
      // `getServiceInfoWithCache` devolvía cached `not_yet_provisioned`
      // hasta TTL (60s) aunque el plugin ya hubiera creado refs externas.
      await this.cache.invalidate(serviceId);

      await this.applyFollowUp(service, result.followUp, correlationId);

      this.logger.log(
        `Provisioning OK for service ${serviceId} (plugin=${pluginSlug}, followUp=[${result.followUp.join(',')}]).`,
      );
    } catch (err) {
      const isPluginErr = err instanceof ProvisionerPluginError;
      const code = isPluginErr ? err.code : 'UNKNOWN';
      const retriable = isPluginErr ? err.retriable : true;

      if (retriable) {
        // Re-throw para que BullMQ reintente con backoff.
        this.logger.warn(
          `Provisioning retriable error for service ${serviceId} (plugin=${pluginSlug}, code=${code}). Will retry.`,
        );
        throw err;
      }

      // No-retriable: marcar service como cancelled + alertar.
      this.logger.error(
        `Provisioning permanent failure for service ${serviceId} (plugin=${pluginSlug}, code=${code}). Marking cancelled.`,
      );

      await this.prisma.service.update({
        where: { id: serviceId },
        data: {
          status: 'cancelled',
          cancelled_at: new Date(),
          cancellation_reason: `provisioning_failed:${code}`,
        },
      });

      // Sprint 15C.II Fase C round 3 — invalidar cache también tras
      // failure permanente (status pasa a cancelled, UI debe ver el
      // cambio inmediato sin esperar TTL).
      await this.cache.invalidate(serviceId);

      this.events.emit('service.provisioning_failed', {
        service_id: serviceId,
        user_id: service.user_id,
        provisioner_slug: pluginSlug,
        reason: code,
        correlation_id: correlationId,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 3. FollowUp dispatch
  // ──────────────────────────────────────────────────────────────────────

  private async applyFollowUp(
    service: ServiceWithRelations,
    followUp: readonly ProvisioningFollowUp[],
    correlationId: string,
  ): Promise<void> {
    if (followUp.includes('mark_active')) {
      await this.markActive(service.id, service.user_id, correlationId);
    }

    if (followUp.includes('wait_for_task_completion')) {
      // El listener `provisioning-on-task-completed` activará el servicio
      // cuando se cierre la Task asociada (Fase 11.C). Solo logueamos.
      this.logger.log(
        `Service ${service.id} waiting for task completion (followUp=wait_for_task_completion).`,
      );
    }

    if (followUp.includes('create_setup_task')) {
      await this.createSetupTask(service);
    }
  }

  private async markActive(
    serviceId: string,
    userId: string,
    correlationId: string,
  ): Promise<void> {
    await this.prisma.service.update({
      where: { id: serviceId },
      data: { status: 'active' },
    });

    this.events.emit('service.activated', {
      service_id: serviceId,
      user_id: userId,
      correlation_id: correlationId,
    });
  }

  private async createSetupTask(service: ServiceWithRelations): Promise<void> {
    // Sprint 16 (ADR-079 §2 trigger #3): Task `provisioning_manual` con
    // source_id = service.id. La idempotencia + auto-asignación canónicas
    // las gestiona `TasksService.createFromTrigger` + `autoAssignTask`. El
    // listener `provisioning-on-task-completed` activa el servicio al cerrar.
    try {
      const tier = await this.getClientSITier(service.user_id);
      const now = new Date();
      const priority = calculateTaskPriority('provisioning_manual', tier);
      const due_date = calculateTaskDueDate('provisioning_manual', tier, now);
      const assigned_to = await autoAssignTask(
        this.prisma,
        'provisioning_manual',
      );

      await this.tasks.createFromTrigger({
        source_system: 'provisioning_manual',
        source_id: service.id,
        client_id: service.user_id,
        assigned_to,
        priority,
        due_date,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to create provisioning_manual task for service ${service.id}: ${msg}`,
      );
    }
  }

  private async getClientSITier(
    clientId: string,
  ): Promise<import('@prisma/client').SupportInsidePriorityTier | null> {
    const sub = await this.prisma.supportInsideSubscription.findUnique({
      where: { client_id: clientId },
      select: {
        status: true,
        product: {
          select: {
            support_inside_config: { select: { priority_tier: true } },
          },
        },
      },
    });
    if (!sub || sub.status !== 'active') return null;
    return sub.product.support_inside_config?.priority_tier ?? null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4. Helper: cargar service con relaciones canónicas
  // ──────────────────────────────────────────────────────────────────────

  private async loadServiceWithRelations(
    serviceId: string,
  ): Promise<ServiceWithRelations | null> {
    const row = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            provisioner: true,
            provisioner_config: true,
          },
        },
      },
    });

    if (!row) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: row.user_id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        language: true,
      },
    });

    if (!user) return null;

    // Schema actual de `users` no tiene `phone`/`company_name`/`country_code`
    // (esos viven en `billing_profiles` cuando aplica). Cumplimos el shape
    // canónico de ClientPublicData con null donde no hay dato.
    return {
      ...row,
      client: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: null,
        phone: null,
        locale: user.language ?? null,
        country_code: null,
      },
      product: {
        id: row.product.id,
        slug: row.product.slug,
        name: row.product.name,
        type: String(row.product.type),
        provisioner: row.product.provisioner,
        provisioner_config:
          (row.product.provisioner_config as Record<string, unknown>) ?? null,
      },
    } as ServiceWithRelations;
  }
}

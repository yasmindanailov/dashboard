import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { OutboxService } from '../../core/outbox/outbox.service';
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
    // Sprint 15D Fase 15D.D — emisión transaccional de `domain.*` vía Outbox
    // (R8 + ADR-084 §5). `OutboxModule` es @Global → no requiere import.
    private readonly outbox: OutboxService,
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

    const pluginSlug = service.product.provisioner;
    const plugin = this.registry.get(pluginSlug);

    // Sprint 15D.E — detección de RENOVACIÓN (ADR-084 §5 + ADR-077 A10).
    // `invoice.paid` sobre un servicio YA `active` solo ocurre por la factura de
    // renovación (el alta inicial paga estando `pending`). Para un registrar de
    // dominios con `provider_reference` ya persistido, eso es una renovación: se
    // enruta a `provision(renew)` (DOM-INV-4 + idempotencia por período viven en
    // el plugin). El resto de servicios activos se omiten (idempotente, como hasta
    // ahora). NO se confía en `metadata.domain_operation` (diría 'register', stale).
    const isDomainRenewal =
      service.status === 'active' &&
      !!plugin &&
      plugin.capabilities.is_domain_registrar &&
      !!service.provider_reference;

    // Un servicio ya `active` que NO es una renovación → skip idempotente (incluye
    // el caso de plugin no registrado: no se emite fallo, el servicio ya está vivo).
    if (service.status === 'active' && !isDomainRenewal) {
      this.logger.debug(
        `Provisioning skipped for service ${serviceId}: already active (idempotent).`,
      );
      return;
    }

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

    // status='provisioning' SOLO en el aprovisionamiento inicial (pending→active).
    // Una renovación conserva el servicio `active`: un fallo de renovación NO debe
    // mostrar el dominio "aprovisionando" ni tumbarlo (sigue registrado y vigente).
    if (!isDomainRenewal) {
      await this.prisma.service.update({
        where: { id: serviceId },
        data: {
          status: 'provisioning',
          provisioner_slug: pluginSlug,
        },
      });
    }

    const ctx: ProvisionContext = {
      service,
      client: service.client,
      productConfig:
        (service.product.provisioner_config as Record<string, unknown>) ?? {},
      serverId: service.server_id ?? null,
      correlationId,
      // Sprint 15D — ADR-077 A10: intención del provision para registrars. En una
      // renovación se fuerza 'renew' (la metadata del servicio diría 'register' del
      // alta — stale); en el resto se deriva de `metadata.domain_operation`
      // (lo fija el checkout, 15D.B). Los plugins no-registrar la ignoran.
      operation: isDomainRenewal
        ? 'renew'
        : this.deriveDomainOperation(service.metadata),
    };

    try {
      const result = await plugin.provision(ctx);

      // Sprint 15D Fase 15D.D — persistir `provider_reference` + `metadata` y, si
      // es un registrar haciendo un `register` NUEVO (no un reintento sobre un
      // `provider_reference` ya persistido), emitir `domain.registered` **en la
      // misma transacción** vía Outbox (R8 + ADR-084 §5). `!service.provider_reference`
      // (era fresco) evita re-emitir en reintentos puros / adopción DOM-INV-1.
      const operation = ctx.operation ?? 'register';
      const emitDomainRegistered =
        plugin.capabilities.is_domain_registrar &&
        operation === 'register' &&
        !service.provider_reference &&
        !!result.providerReference;

      // Sprint 15D.E — renovación verificada (DOM-INV-4): el plugin devuelve el
      // nuevo `expires_at` (que ya confirmó que avanzó) + `domain_renew_performed`.
      // Se persiste en `services.expires_at` y se emite `domain.renewed` SOLO si la
      // renovación se ejecutó de verdad (no en idempotencia pura → no re-emite).
      const newExpiresAt = parseIsoDate(result.metadata.domain_expires_at);
      const emitDomainRenewed =
        isDomainRenewal && result.metadata.domain_renew_performed === true;

      await this.prisma.$transaction(async (tx) => {
        await tx.service.update({
          where: { id: serviceId },
          data: {
            provider_reference: result.providerReference,
            metadata: result.metadata as Prisma.InputJsonValue,
            ...(newExpiresAt ? { expires_at: newExpiresAt } : {}),
          },
        });
        if (emitDomainRegistered) {
          await this.outbox.enqueue(tx, 'domain.registered', {
            service_id: serviceId,
            user_id: service.user_id,
            fqdn: service.domain,
            years:
              typeof result.metadata.domain_years === 'number'
                ? result.metadata.domain_years
                : null,
            // `expires_at` no se conoce en register; lo puebla el reconcile
            // (Fase 15D.E) en `services.expires_at` + los avisos de expiración.
            expires_at: null,
            correlation_id: correlationId,
          });
        }
        if (emitDomainRenewed) {
          await this.outbox.enqueue(tx, 'domain.renewed', {
            service_id: serviceId,
            user_id: service.user_id,
            fqdn: service.domain,
            new_expires_at: newExpiresAt ? newExpiresAt.toISOString() : null,
            correlation_id: correlationId,
          });
        }
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

      // Sprint 15D.E — un fallo NO-retriable de RENOVACIÓN (p.ej.
      // DOMAIN_IN_REDEMPTION) NO debe cancelar un dominio activo y registrado: el
      // dominio sigue vigente, solo falló renovarlo. Se conserva `active` + se
      // alerta para acción manual (NO se toca status ni se desprovisiona).
      if (isDomainRenewal) {
        this.logger.error(
          `Renewal permanent failure for active domain service ${serviceId} ` +
            `(plugin=${pluginSlug}, code=${code}). Service stays active; manual action required.`,
        );
        this.events.emit('service.provisioning_failed', {
          service_id: serviceId,
          user_id: service.user_id,
          provisioner_slug: pluginSlug,
          reason: `renew_failed:${code}`,
          correlation_id: correlationId,
        });
        return;
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

  /**
   * Sprint 15D — ADR-077 A10: deriva `ProvisionContext.operation` de
   * `metadata.domain_operation` (lo fija el checkout, 15D.B). `undefined` para
   * servicios no-dominio (el plugin lo trata como 'register' por defecto; los
   * plugins no-registrar lo ignoran).
   */
  private deriveDomainOperation(
    metadata: unknown,
  ): ProvisionContext['operation'] {
    const md =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    const op = md.domain_operation;
    if (op === 'register' || op === 'renew' || op === 'transfer_in') return op;
    return undefined;
  }

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
        // Sprint 15D — ADR-077 Amendment A12: los datos de registrante WHOIS
        // (dirección/teléfono/tax_id) viven en `client_profiles` (1:1 con
        // `users`). El orquestador los carga aquí para poblar ClientPublicData.
        client_profile: {
          select: {
            company_name: true,
            phone: true,
            tax_id: true,
            address_line1: true,
            address_line2: true,
            city: true,
            state: true,
            postal_code: true,
            country: true,
          },
        },
      },
    });

    if (!user) return null;

    // Sprint 15D — ADR-077 Amendment A12: los plugins de registrar
    // (`is_domain_registrar=true`) necesitan los datos de registrante para crear
    // el customer/contact WHOIS (ADR-081 §3/§4). Viven en `client_profiles`
    // (1:1 con `users`); `country_code` = `ClientProfile.country` (ISO-2, default
    // 'ES'). `null` donde el cliente no completó el perfil → el registrar aplica
    // la elegibilidad (`REGISTRANT_INELIGIBLE`). Los plugins no-registrar
    // (enhance_cp/internal/manual) ignoran estos campos.
    const profile = user.client_profile;
    return {
      ...row,
      client: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: profile?.company_name ?? null,
        phone: profile?.phone ?? null,
        locale: user.language ?? null,
        country_code: profile?.country ?? null,
        address_line1: profile?.address_line1 ?? null,
        address_line2: profile?.address_line2 ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        postal_code: profile?.postal_code ?? null,
        tax_id: profile?.tax_id ?? null,
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

/**
 * Sprint 15D.E — parsea el `domain_expires_at` (ISO) que el plugin de registrar
 * devuelve en `ProvisionResult.metadata` tras una renovación verificada (DOM-INV-4)
 * para persistirlo en `services.expires_at`. Devuelve `null` si ausente/ilegible
 * (el reconcile cron lo poblará de todas formas — defensivo).
 */
function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

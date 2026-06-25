import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getErrorMessage } from '../../core/common/utils/error.util';
import { ProvisioningService } from '../provisioning/provisioning.service';
import { BillingCalculatorService } from './billing-calculator.service';
import {
  DeprovisionReasonDto,
  SuspensionReasonDto,
} from '../provisioning/dto/provisioning.dto';

/**
 * Etiqueta canónica del actor sistema del cron de impago (Sprint 15C.II Fase
 * F.5 — taxonomía `system:<dominio>-<cron|job>`). Va a
 * `audit_change_log.changes_after.actor` cuando `suspendAsAdmin` se invoca
 * sin un actor humano.
 */
const BILLING_OVERDUE_CRON_ACTOR = 'system:billing-overdue-cron';

/**
 * Etiqueta canónica del actor sistema del cron de auto-CANCELACIÓN por impago
 * (audit 2026-06-25 GL-2). Misma taxonomía `system:<dominio>-<cron>`;
 * `deprovisionAsAdmin` la escribe en `audit_change_log.changes_after.actor`.
 */
const BILLING_CANCELLATION_CRON_ACTOR = 'system:billing-cancellation-cron';

/**
 * ServiceLifecycleWorker — Scheduled jobs for service status automation.
 *
 * Handles:
 * - Auto-suspension after exhausted payment retries (6.5) — Sprint 15C.II
 *   Fase F.5: delega en `ProvisioningService.suspendAsAdmin` (punto único de
 *   transición de estado) en vez de hacer su propio `prisma.update`, para que
 *   la BD y el proveedor no divergan (pasa por la inline action
 *   `suspend_service` del plugin) y el camino sea idéntico al de la suspensión
 *   manual del admin (mismo evento `service.suspended` forma completa, mismo
 *   audit, mismo email al cliente vía `notifications-on-service-suspended`).
 * - Auto-cancellation after suspension period (6.5)
 * - Auto-resume of paused services past max date (6.7)
 *
 * Ref: DECISIONS.md §12, §21 | ARCHITECTURE.md Regla 15
 */
@Injectable()
export class ServiceLifecycleWorker {
  private readonly logger = new Logger('ServiceLifecycleWorker');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calculator: BillingCalculatorService,
    private readonly provisioning: ProvisioningService,
  ) {}

  /* ── 6.5 — Auto-suspension (daily 03:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoSuspendServices(): Promise<void> {
    const suspensionDays = await this.calculator.getSettingValue<number>(
      'billing',
      'suspension_days',
      7,
    );
    const cutoff = new Date(Date.now() - suspensionDays * 86400_000);

    const exhaustedInvoices = await this.prisma.invoice.findMany({
      where: { status: 'overdue', due_date: { lte: cutoff } },
      include: { items: true },
    });

    const toSuspend = exhaustedInvoices.filter(
      (inv) => inv.retry_count >= inv.max_retries,
    );
    if (toSuspend.length === 0) return;

    this.logger.log(
      `Auto-suspending services for ${toSuspend.length} exhausted invoices`,
    );

    for (const invoice of toSuspend) {
      const serviceIds = invoice.items
        .filter((i) => i.service_id)
        .map((i) => i.service_id!);

      for (const serviceId of serviceIds) {
        try {
          // Sprint 15C.II Fase F.5: punto único de transición de estado.
          // `suspendAsAdmin` resuelve el plugin, invoca su inline action
          // `suspend_service` (`patchSubscription({isSuspended:true})` en
          // Enhance), transiciona `services.status`, emite `service.suspended`
          // con la forma completa, y audita — todo bajo el actor sistema
          // (`actorUserId: null` + `actorLabel`). `allowUnsupported: true` para
          // que los plugins `internal`/`manual` (sin `supports_suspend`) se
          // sigan suspendiendo solo del lado de Aelium (como antes). El motivo
          // es el enum canónico `overdue_payment`; el `internal_note` viaja al
          // body del `ClientNote` que F.6 crea con `triggered_by_action=
          // 'service.auto_suspended_overdue'` — el body es self-descriptive
          // para que la nota tenga sentido fuera del contexto del banner.
          // Idempotente: si el servicio ya está `suspended` → no-op; si está
          // `cancelled` → 409 que el `catch` registra (antes el `prisma.update`
          // crudo revivía un servicio cancelado a `suspended` — bug que esto
          // arregla de paso).
          const result = await this.provisioning.suspendAsAdmin(
            serviceId,
            {
              reason: SuspensionReasonDto.overdue_payment,
              internal_note: `Suspendido automáticamente por impago — Factura ${invoice.invoice_number}`,
              notify_client: true,
            },
            null,
            undefined,
            { actorLabel: BILLING_OVERDUE_CRON_ACTOR, allowUnsupported: true },
          );

          if (result.alreadySuspended) {
            this.logger.log(
              `Service ${serviceId} already suspended — skipping (unpaid invoice ${invoice.invoice_number}).`,
            );
          } else {
            this.logger.warn(
              `Service ${serviceId} suspended due to unpaid invoice ${invoice.invoice_number}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to suspend service ${serviceId}: ${getErrorMessage(error)}`,
          );
        }
      }
    }
  }

  /* ── 6.5 — Auto-cancellation (daily 04:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async autoCancelServices(): Promise<void> {
    const cancellationDays = await this.calculator.getSettingValue<number>(
      'billing',
      'cancellation_days',
      30,
    );
    const cutoff = new Date(Date.now() - cancellationDays * 86400_000);

    const suspendedServices = await this.prisma.service.findMany({
      where: { status: 'suspended', suspended_at: { lte: cutoff } },
    });

    if (suspendedServices.length === 0) return;

    this.logger.log(
      `Auto-cancelling ${suspendedServices.length} services suspended > ${cancellationDays} days`,
    );

    for (const service of suspendedServices) {
      try {
        // Sprint 15C.II Fase F.5 / audit 2026-06-25 GL-2: punto único de
        // transición — `deprovisionAsAdmin` (actor sistema) transiciona el
        // estado, DESTRUYE el recurso en el proveedor (`plugin.deprovision()`),
        // emite `service.cancelled` con la forma completa y audita. Antes este
        // cron hacía un `prisma.update` crudo + emit parcial, dejando el recurso
        // vivo y facturable en el proveedor (resource/billing leak).
        await this.provisioning.deprovisionAsAdmin(
          service.id,
          {
            reason: DeprovisionReasonDto.cancelled,
            notes: `Cancelación automática — suspendido por impago > ${cancellationDays} días`,
            notify_client: true,
          },
          null,
          undefined,
          { actorLabel: BILLING_CANCELLATION_CRON_ACTOR },
        );

        this.logger.warn(
          `Service ${service.id} auto-cancelled after ${cancellationDays} days ` +
            `suspended (recurso del proveedor destruido)`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel service ${service.id}: ${getErrorMessage(error)}`,
        );
      }
    }
  }

  /* ── 6.7 — Pause expiration (daily 05:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async checkPauseExpiration(): Promise<void> {
    const expiredPauses = await this.prisma.service.findMany({
      where: {
        status: 'suspended',
        paused_at: { not: null },
        pause_max_date: { lte: new Date() },
      },
    });

    if (expiredPauses.length === 0) return;

    this.logger.log(
      `Resuming ${expiredPauses.length} services with expired pause`,
    );

    for (const service of expiredPauses) {
      try {
        await this.prisma.service.update({
          where: { id: service.id },
          data: {
            status: 'active',
            paused_at: null,
            pause_max_date: null,
            suspended_at: null,
            suspension_reason: null,
          },
        });

        this.eventEmitter.emit('service.resumed', {
          service_id: service.id,
          user_id: service.user_id,
          reason: 'pause_expired',
        });

        this.logger.log(`Service ${service.id} resumed after pause expiration`);
      } catch (error) {
        this.logger.error(
          `Failed to resume service ${service.id}: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}

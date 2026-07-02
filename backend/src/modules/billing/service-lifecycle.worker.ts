import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxService } from '../../core/outbox/outbox.service';
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
 * Etiqueta canónica del actor sistema del cron de suspensión por
 * auto-renovación desactivada (F4·W3). Misma taxonomía `system:<dominio>-<cron>`.
 */
const AUTO_RENEW_OFF_CRON_ACTOR = 'system:auto-renew-off-cron';

/** Milisegundos en un día (ventanas del aviso previo de cancelación). */
const DAY_MS = 86_400_000;

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
    // R8 (audit 2026-06-25 GL-17): `service.resumed` (auto-reanudación al
    // expirar la pausa) se persiste vía Outbox en la tx del cambio de status.
    // `service.cancellation_scheduled` permanece como `emit()` directo (alerta,
    // no transacción — su durabilidad la aporta BullMQ aguas abajo).
    private readonly outbox: OutboxService,
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

  /* ── F4·W3 — Suspensión por auto-renovación desactivada (daily 03:15 UTC) ── */

  /**
   * Suspende los servicios de HOSTING (no dominios) cuya auto-renovación está
   * OFF y cuyo periodo pagado ya venció (`next_due_date <= now`). Sin factura de
   * renovación (el `BillingLifecycleWorker` la omite por el gate `auto_renew`),
   * Enhance no apaga el servicio por sí solo → Aelium lo suspende aquí (reason
   * `not_renewed`), y el `autoCancelServices` existente lo cancela tras la
   * ventana de gracia. Los DOMINIOS se excluyen: expiran solos en el registrador
   * (redención → delete), gestionado por el reconcile de dominios.
   *
   * Se programa a las 03:15 (tras `autoSuspendServices` 03:00). El orden
   * intra-día es irrelevante (la cancelación mira una ventana de 30 días).
   */
  @Cron('15 3 * * *', { name: 'suspendNonRenewedServices', timeZone: 'UTC' })
  async suspendNonRenewedServices(): Promise<void> {
    try {
      const summary = await this.runNonRenewedSuspension();
      this.logger.log(
        `suspendNonRenewedServices done: checked=${summary.checked} ` +
          `suspended=${summary.suspended} errors=${summary.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `suspendNonRenewedServices failed at top level: ${getErrorMessage(err)}`,
      );
    }
  }

  /** Una pasada. Pública para trigger manual + tests deterministas. */
  async runNonRenewedSuspension(
    now: Date = new Date(),
  ): Promise<NonRenewedSuspensionSummary> {
    const candidates = await this.prisma.service.findMany({
      where: {
        status: 'active',
        auto_renew: false,
        next_due_date: { lte: now },
        // Solo hosting (y demás servicios Aelium-billed): los dominios expiran
        // en el registrador por sí solos, no se suspenden aquí.
        product: { type: { not: 'domain' } },
      },
      select: { id: true, user_id: true },
    });

    const summary: NonRenewedSuspensionSummary = {
      checked: candidates.length,
      suspended: 0,
      errors: 0,
    };

    for (const service of candidates) {
      try {
        // Guard: si el cliente desactivó la auto-renovación DESPUÉS de que se
        // generara la factura de renovación, hay una factura abierta → deja que
        // el dunning normal (impago) la gestione, no dupliques la transición.
        const openInvoice = await this.prisma.invoice.findFirst({
          where: {
            user_id: service.user_id,
            status: { in: ['draft', 'pending', 'overdue'] },
            items: { some: { service_id: service.id } },
          },
          select: { id: true },
        });
        if (openInvoice) continue;

        // Punto único de transición (mismo camino que la suspensión por impago):
        // `suspendAsAdmin` transiciona el estado, invoca la inline action del
        // plugin si la soporta, emite `service.suspended` (email al cliente) y
        // audita. `allowUnsupported` para plugins sin `supports_suspend`.
        const result = await this.provisioning.suspendAsAdmin(
          service.id,
          {
            reason: SuspensionReasonDto.not_renewed,
            internal_note:
              'Suspendido automáticamente — auto-renovación desactivada, periodo pagado vencido',
            notify_client: true,
          },
          null,
          undefined,
          { actorLabel: AUTO_RENEW_OFF_CRON_ACTOR, allowUnsupported: true },
        );

        if (!result.alreadySuspended) {
          summary.suspended++;
          this.logger.warn(
            `Service ${service.id} suspended — auto-renovación off, periodo vencido`,
          );
        }
      } catch (error) {
        summary.errors++;
        this.logger.error(
          `Failed to suspend non-renewed service ${service.id}: ${getErrorMessage(error)}`,
        );
      }
    }
    return summary;
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

  /* ── 6.5b — Aviso previo de cancelación (daily 02:30 UTC) — audit GL-2 / H2.3 ── */

  /**
   * Avisa al cliente ANTES de que `autoCancelServices` cancele (y DESTRUYA en el
   * proveedor vía `plugin.deprovision()`) un servicio suspendido por impago.
   * Completa la decisión GL-2 "destruir CON aviso previo": la destrucción es
   * irreversible, así que el cliente recibe `cancellation_notice_days` (default
   * 7) días de margen para regularizar el pago.
   *
   * Se programa a las 02:30 (antes del 04:00 de `autoCancelServices`), pero el
   * orden intra-día es irrelevante: la ventana del aviso es DISJUNTA de la de
   * cancelación (avisa mientras `suspended_at > cancelCutoff`, es decir, antes de
   * ser elegible para cancelar), así que no hay carrera ni hueco.
   */
  @Cron('30 2 * * *', { name: 'notifyUpcomingCancellations', timeZone: 'UTC' })
  async notifyUpcomingCancellations(): Promise<void> {
    try {
      const summary = await this.runCancellationNotices();
      this.logger.log(
        `notifyUpcomingCancellations done: checked=${summary.checked} ` +
          `notified=${summary.notified} errors=${summary.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `notifyUpcomingCancellations failed at top level: ${getErrorMessage(err)}`,
      );
    }
  }

  /** Una pasada. Pública para trigger manual + tests deterministas. */
  async runCancellationNotices(
    now: Date = new Date(),
  ): Promise<CancellationNoticesSummary> {
    const cancellationDays = await this.calculator.getSettingValue<number>(
      'billing',
      'cancellation_days',
      30,
    );
    const rawNoticeDays = await this.calculator.getSettingValue<number>(
      'billing',
      'cancellation_notice_days',
      7,
    );
    // El lead nunca puede exceder la propia ventana de cancelación: si el admin
    // configura `notice_days >= cancellation_days`, degrada a "avisar al
    // suspender" (lead = cancellationDays) en vez de producir una ventana vacía.
    const noticeDays = Math.max(0, Math.min(rawNoticeDays, cancellationDays));

    // Ventana DISJUNTA del aviso: el servicio ya es bastante viejo para avisar
    // (`<= noticeCutoff`) pero AÚN no es elegible para la cancelación
    // (`> cancelCutoff`). Es el subconjunto que `autoCancelServices` cancelará
    // dentro de `noticeDays` días — avisado un escalón antes.
    const noticeCutoff = new Date(
      now.getTime() - (cancellationDays - noticeDays) * DAY_MS,
    );
    const cancelCutoff = new Date(now.getTime() - cancellationDays * DAY_MS);

    const services = await this.prisma.service.findMany({
      where: {
        status: 'suspended',
        // EXCLUYE pausas voluntarias: `subscription.service.pauseService` fija
        // `suspended_at` igual que la suspensión por impago, pero `paused_at`
        // SOLO lo fija la pausa voluntaria. El aviso es del track de IMPAGO —
        // quien pausó por su cuenta no debe recibir "se cancelará por falta de
        // pago" (verificado contra subscription.service.ts; el bug latente de
        // que `autoCancelServices` SÍ puede cancelar una pausa larga está
        // anotado en backlog para una fase aparte — no se toca un cron
        // destructivo aquí).
        paused_at: null,
        // F4·W3: excluye las suspensiones por auto-renovación desactivada
        // (`not_renewed`) — su aviso es distinto ("no renovado", no "por
        // impago"); el cliente ya recibió el email de suspensión al vencer.
        NOT: { suspension_reason: { startsWith: 'not_renewed' } },
        suspended_at: { lte: noticeCutoff, gt: cancelCutoff },
      },
      select: { id: true, user_id: true, suspended_at: true, metadata: true },
    });

    const summary: CancellationNoticesSummary = {
      checked: services.length,
      notified: 0,
      errors: 0,
    };

    for (const service of services) {
      try {
        if (await this.notifyIfNotYetNotified(service, cancellationDays, now)) {
          summary.notified++;
        }
      } catch (err) {
        summary.errors++;
        this.logger.error(
          `notifyUpcomingCancellations service=${service.id} failed: ${getErrorMessage(err)}`,
        );
      }
    }
    return summary;
  }

  private async notifyIfNotYetNotified(
    service: CancellationNoticeRow,
    cancellationDays: number,
    now: Date,
  ): Promise<boolean> {
    if (!service.suspended_at) return false;

    // Edge-trigger por ciclo de suspensión: se avisa UNA vez por suspensión.
    // Guardamos el instante del aviso; si una re-suspensión posterior fija un
    // `suspended_at` MÁS NUEVO que el último aviso, el flag queda obsoleto y se
    // vuelve a avisar (auto-reset — mismo patrón que `domain_expiry_warned_window`).
    const sentAt = readNoticeSentAt(service.metadata);
    if (sentAt && sentAt >= service.suspended_at) return false;

    // Fecha determinista en que `autoCancelServices` lo cancelará.
    const scheduledCancellationDate = new Date(
      service.suspended_at.getTime() + cancellationDays * DAY_MS,
    );

    // Persistir el flag (edge-trigger) ANTES de emitir, para que un fallo del
    // listener no provoque re-avisos diarios (el evento se traga aguas abajo, R7).
    await this.prisma.service.update({
      where: { id: service.id },
      data: {
        metadata: {
          ...toMetadataObject(service.metadata),
          cancellation_notice_sent_at: now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    // Alerta (trigger de notificación), NO transición de estado → EventEmitter2
    // directo, sin Outbox (las notifs ya tienen durabilidad BullMQ).
    this.eventEmitter.emit('service.cancellation_scheduled', {
      service_id: service.id,
      user_id: service.user_id,
      scheduled_cancellation_date: scheduledCancellationDate.toISOString(),
    });

    this.logger.log(
      `service.cancellation_scheduled service=${service.id} ` +
        `(cancelación prevista ${scheduledCancellationDate.toISOString()}).`,
    );
    return true;
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
        // R8 (GL-17): transición de status + evento `service.resumed` en la
        // misma tx → dispatch at-least-once vía OutboxWorker.
        await this.prisma.$transaction(async (tx) => {
          await tx.service.update({
            where: { id: service.id },
            data: {
              status: 'active',
              paused_at: null,
              pause_max_date: null,
              suspended_at: null,
              suspension_reason: null,
            },
          });
          await this.outbox.enqueue(tx, 'service.resumed', {
            service_id: service.id,
            user_id: service.user_id,
            reason: 'pause_expired',
          });
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

// ────────────────────────────────────────────────────────────────────────────
// Helpers del aviso previo de cancelación (file-private) — audit GL-2 / H2.3
// ────────────────────────────────────────────────────────────────────────────

export interface CancellationNoticesSummary {
  checked: number;
  notified: number;
  errors: number;
}

/** Resumen de una pasada de `runNonRenewedSuspension` (F4·W3). */
export interface NonRenewedSuspensionSummary {
  checked: number;
  suspended: number;
  errors: number;
}

interface CancellationNoticeRow {
  id: string;
  user_id: string;
  suspended_at: Date | null;
  metadata: unknown;
}

/** Lee `metadata.cancellation_notice_sent_at` como Date, o `null` si ausente/inválido. */
function readNoticeSentAt(metadata: unknown): Date | null {
  const v = toMetadataObject(metadata).cancellation_notice_sent_at;
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toMetadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

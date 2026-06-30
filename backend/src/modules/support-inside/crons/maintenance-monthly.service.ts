import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SupportInsidePriorityTier } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { calculateTaskPriority } from '../../../core/tasks/priority-helper';
import { calculateTaskDueDate } from '../../../core/tasks/sla-helper';
import {
  autoAssignTask,
  isAssigneeEligible,
} from '../../../core/tasks/auto-assign';

export interface MaintenanceMonthlyRunResult {
  billing_month: string;
  candidates: number;
  created: number;
  skipped_idempotent: number;
}

/**
 * MaintenanceMonthlyService — Sprint 8 Fase D → Sprint 16 (ADR-079 §2 trigger #2).
 *
 * Cron diario `0 6 * * *` UTC. Filtra slots Support Inside cuyo
 * `anniversary_day = EXTRACT(DAY FROM NOW())` y crea `Task(source_system=
 * 'support_inside_slot', source_id=slot_id)` por cada uno. La idempotencia
 * la garantiza el UNIQUE INDEX parcial `tasks_uniq_active_per_source`
 * (1 task activa por (sistema, source_id)) — no necesitamos el viejo
 * UNIQUE compuesto por (service_id, billing_month, type).
 *
 * Cumple R1 + R2 + R7 + R13 + ADR-034 + ADR-061 + ADR-072 + ADR-079.
 */
@Injectable()
export class MaintenanceMonthlyService {
  private readonly logger = new Logger(MaintenanceMonthlyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  async run(now: Date = new Date()): Promise<MaintenanceMonthlyRunResult> {
    const billingMonth = this.formatBillingMonth(now);
    const todayDay = Math.min(now.getUTCDate(), 28);

    const slots = await this.prisma.supportInsideSlot.findMany({
      where: {
        released_at: null,
        anniversary_day: todayDay,
        subscription: { status: 'active' },
      },
      include: {
        subscription: {
          select: {
            client_id: true,
            id: true,
            // F3·E8 — "tu técnico" estable del cliente (cuidador por
            // suscripción). Si está y sigue siendo elegible, hereda la tarea.
            assigned_technician_id: true,
          },
        },
        service: { select: { id: true, status: true } },
      },
    });

    const eligibleSlots = slots.filter((s) => s.service.status === 'active');
    let created = 0;
    let skippedIdempotent = 0;

    for (const slot of eligibleSlots) {
      const tier = await this.getClientSITier(slot.subscription.client_id);
      const priority = calculateTaskPriority('support_inside_slot', tier);
      const due_date = calculateTaskDueDate('support_inside_slot', tier, now);

      // F3·E8 — preferimos el "técnico asignado" del cliente (cuidador
      // estable por suscripción) si sigue siendo elegible; si no hay técnico
      // o dejó de ser elegible (rol cambiado / inactivo), caemos a la
      // auto-asignación V1 (menor carga). Mismo patrón que `support_ticket`,
      // que hereda el `assigned_to` del ticket en vez de auto-asignar.
      const technicianId = slot.subscription.assigned_technician_id;
      const assigned_to =
        technicianId &&
        (await isAssigneeEligible(
          this.prisma,
          technicianId,
          'support_inside_slot',
        ))
          ? technicianId
          : await autoAssignTask(this.prisma, 'support_inside_slot');

      try {
        const task = (await this.tasks.createFromTrigger({
          source_system: 'support_inside_slot',
          source_id: slot.id,
          client_id: slot.subscription.client_id,
          assigned_to,
          priority,
          due_date,
        })) as { __idempotent_hit?: boolean };
        // `createFromTrigger` marca `__idempotent_hit=true` cuando devuelve
        // una task pre-existente (P2002 capturado). En ese caso contamos
        // como skipped en lugar de created.
        if (task.__idempotent_hit) {
          skippedIdempotent += 1;
        } else {
          created += 1;
        }
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          skippedIdempotent += 1;
          continue;
        }
        this.logger.error(
          `Failed to create monthly maintenance for slot ${slot.id} (service ${slot.service.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    }

    if (created > 0 || skippedIdempotent > 0) {
      this.logger.log(
        `maintenance-monthly: month=${billingMonth} candidates=${eligibleSlots.length} created=${created} skipped_idempotent=${skippedIdempotent}`,
      );
    } else {
      this.logger.debug(
        `maintenance-monthly: month=${billingMonth} no eligible slots`,
      );
    }

    return {
      billing_month: billingMonth,
      candidates: eligibleSlots.length,
      created,
      skipped_idempotent: skippedIdempotent,
    };
  }

  private async getClientSITier(
    clientId: string,
  ): Promise<SupportInsidePriorityTier | null> {
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

  private formatBillingMonth(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
}

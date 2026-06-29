import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { isAssigneeEligible } from '../../core/tasks/auto-assign';

/**
 * SupportInsideAdminService — Rediseño UI F3·E8 (Support Inside gestionado).
 *
 * Gestión admin por-cliente de las suscripciones Support Inside (distinto de
 * `SupportInsidePlansAdminService`, que edita los 3 planes). De momento:
 * asignar/reasignar el "técnico asignado" (cuidador estable por cliente).
 * Fase D añadirá listado + detalle por cliente.
 *
 * Cumple R1 (audita por evento, no llama a AuditService directo): emite
 * `support_inside.technician_assigned` → `SupportInsideAuditListener`.
 */
@Injectable()
export class SupportInsideAdminService {
  private readonly logger = new Logger(SupportInsideAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Asigna/reasigna el técnico de una suscripción. `technicianId=null`
   * desasigna. El técnico debe ser un asignatario elegible (staff de soporte
   * activo) — misma doctrina de roles que la auto-asignación de tareas.
   *
   * **Reasignación de la tarea del periodo en curso (decisión Yasmin):** se
   * reasignan SOLO las tareas de mantenimiento `pending` de los slots de la
   * suscripción (nadie las ha empezado); las `in_progress` se respetan. Las
   * futuras las hereda el cron mensual.
   */
  async assignTechnician(
    subscriptionId: string,
    technicianId: string | null,
  ): Promise<{
    subscription_id: string;
    technician_id: string | null;
    reassigned_pending_tasks: number;
  }> {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { id: subscriptionId },
        select: {
          id: true,
          client_id: true,
          assigned_technician_id: true,
          slots: { where: { released_at: null }, select: { id: true } },
        },
      },
    );
    if (!subscription) {
      throw new NotFoundException('Suscripción Support Inside no encontrada.');
    }

    if (
      technicianId &&
      !(await isAssigneeEligible(
        this.prisma,
        technicianId,
        'support_inside_slot',
      ))
    ) {
      throw new BadRequestException(
        'El técnico debe ser un agente de soporte activo.',
      );
    }

    const previousTechnicianId = subscription.assigned_technician_id;
    const slotIds = subscription.slots.map((s) => s.id);

    const reassignedPendingTasks = await this.prisma.$transaction(
      async (tx) => {
        await tx.supportInsideSubscription.update({
          where: { id: subscriptionId },
          data: { assigned_technician_id: technicianId },
        });
        if (slotIds.length === 0) return 0;
        const res = await tx.task.updateMany({
          where: {
            source_system: 'support_inside_slot',
            source_id: { in: slotIds },
            status: 'pending',
          },
          data: { assigned_to: technicianId },
        });
        return res.count;
      },
    );

    this.events.emit('support_inside.technician_assigned', {
      subscription_id: subscription.id,
      client_id: subscription.client_id,
      technician_id: technicianId,
      previous_technician_id: previousTechnicianId,
      reassigned_pending_tasks: reassignedPendingTasks,
    });

    this.logger.log(
      `technician ${technicianId ?? 'unassigned'} on subscription=${subscription.id} (reassigned ${reassignedPendingTasks} pending tasks)`,
    );

    return {
      subscription_id: subscription.id,
      technician_id: technicianId,
      reassigned_pending_tasks: reassignedPendingTasks,
    };
  }
}

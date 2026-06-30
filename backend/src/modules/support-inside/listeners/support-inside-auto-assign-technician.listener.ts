import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { autoAssignTask } from '../../../core/tasks/auto-assign';
import { SupportInsideAdminService } from '../support-inside-admin.service';

/**
 * SupportInsideAutoAssignTechnicianListener — Rediseño UI F3·E8 (iteración 2026-06-29).
 *
 * Cuando un cliente CONTRATA Support Inside (`support_inside.subscribed`, emitido
 * tanto por `SupportInsideService.subscribe()` como por
 * `SupportInsideOnServiceProvisionedListener` en el checkout), si la suscripción
 * queda **sin técnico**, se le auto-asigna uno por **menor carga** (decisión
 * Yasmin: todo cliente SI tiene técnico desde el día 1).
 *
 * Doctrina:
 *   - Reusa `autoAssignTask('support_inside_slot')` (pool agent_support/agent_full,
 *     **sin superadmin** — no se auto-carga al dueño) → el agente con menos carga.
 *   - Reusa `SupportInsideAdminService.assignTechnician` (setea + reasigna tareas
 *     pending + emite `support_inside.technician_assigned` → notificación campana
 *     al técnico [F3·E8] + audit R3). Cero divergencia con la asignación manual.
 *   - Solo actúa si la suscripción está `active` y `assigned_technician_id` es
 *     null (respeta un técnico ya asignado / reactivaciones que lo conservan).
 *   - Si no hay agente elegible → queda sin técnico (el admin lo asigna a mano;
 *     el cron de mantenimiento cae a auto-asignación). Fallback básico.
 *   - Degradación elegante (R7): cualquier fallo se loguea y se traga (la
 *     suscripción + el cobro ya se ejecutaron; no tener técnico no los deshace).
 *   - R1: escucha el bus, no acopla el alta con la asignación.
 */
@Injectable()
export class SupportInsideAutoAssignTechnicianListener {
  private readonly logger = new Logger(
    SupportInsideAutoAssignTechnicianListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: SupportInsideAdminService,
  ) {}

  @OnEvent('support_inside.subscribed')
  async handleSubscribed(payload: {
    subscription_id: string;
    client_id: string;
    product_id: string;
    service_id: string;
  }): Promise<void> {
    try {
      const subscription =
        await this.prisma.supportInsideSubscription.findUnique({
          where: { id: payload.subscription_id },
          select: { status: true, assigned_technician_id: true },
        });
      // Ya tiene técnico, o no está activa → nada que hacer.
      if (
        !subscription ||
        subscription.status !== 'active' ||
        subscription.assigned_technician_id
      ) {
        return;
      }

      const technicianId = await autoAssignTask(
        this.prisma,
        'support_inside_slot',
      );
      if (!technicianId) {
        this.logger.warn(
          `Sin agentes elegibles para auto-asignar técnico a la suscripción ${payload.subscription_id} — queda sin técnico.`,
        );
        return;
      }

      // Reusa la asignación canónica (setea + emite technician_assigned →
      // notificación + audit). No hay tareas pending todavía (slots se añaden
      // después) → reassigned_pending_tasks = 0.
      await this.admin.assignTechnician(payload.subscription_id, technicianId);

      this.logger.log(
        `Técnico ${technicianId} auto-asignado a la suscripción ${payload.subscription_id} (menor carga).`,
      );
    } catch (err) {
      this.logger.error(
        `Auto-asignación de técnico falló para la suscripción ${payload.subscription_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}

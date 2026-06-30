import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnTechnicianAssignedListener — Rediseño UI F3·E8 (admin).
 *
 * Consume `support_inside.technician_assigned` (emitido por
 * `SupportInsideAdminService.assignTechnician`) y despacha al agente una
 * notificación **informativa** de campana: "ahora eres el técnico de [cliente]".
 *
 * Doctrina:
 *   - La notificación es INFO (sin acción). Lo accionable —la tarea de
 *     mantenimiento mensual— la crea el cron `maintenance-monthly` por separado
 *     (decisión Yasmin 2026-06-29: notificación ≠ tarea).
 *   - Solo se notifica al NUEVO técnico (cuando `technician_id != null`); la
 *     desasignación no notifica.
 *   - NO llama a `EmailService` directo (ADR-065): usa `dispatchToUser`.
 *   - Degradación elegante (R7): cualquier fallo se loguea y se traga (la
 *     asignación + su audit ya se ejecutaron; perder la campana no la deshace).
 *   - Convive con `SupportInsideAuditListener` (audita el mismo evento, R1).
 */
@Injectable()
export class NotificationsOnTechnicianAssignedListener {
  private readonly logger = new Logger(
    NotificationsOnTechnicianAssignedListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('support_inside.technician_assigned')
  async handleTechnicianAssigned(payload: {
    subscription_id: string;
    client_id: string;
    technician_id: string | null;
    previous_technician_id: string | null;
    reassigned_pending_tasks: number;
  }): Promise<void> {
    // Desasignación (null) → no hay a quién informar.
    if (!payload.technician_id) return;

    try {
      const client = await this.prisma.user.findUnique({
        where: { id: payload.client_id },
        select: { first_name: true, last_name: true, email: true },
      });
      const clientName = client
        ? `${client.first_name} ${client.last_name}`.trim() || client.email
        : 'un cliente';

      await this.notifications.dispatchToUser(
        'support_inside.technician_assigned',
        { client_name: clientName },
        payload.technician_id,
      );

      this.logger.log(
        `technician_assigned bell dispatched to technician=${payload.technician_id} ` +
          `(client=${payload.client_id})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch support_inside.technician_assigned notification ` +
          `(technician=${payload.technician_id} client=${payload.client_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}

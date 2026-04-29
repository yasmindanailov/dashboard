import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

interface MaintenanceCompletedPayload {
  taskId: string;
  maintenanceLogId: string;
  serviceId: string;
  clientId: string;
  monthYear: string;
  completedBy: string;
  completedAt: Date | null;
  notes: string;
}

/**
 * MaintenanceCompletedListener — Sprint 8 Fase B.5 (2026-04-29).
 *
 * Consume `maintenance.completed` emitido por `MaintenanceLogService`
 * tras cerrar exitosamente una task de mantenimiento. Notifica al
 * cliente vía `NotificationsService.dispatchToUser` con plantilla
 * canónica `maintenance.completed` (email + internal).
 *
 * Plantillas seedeadas en `notification-templates.ts` (Sprint 8 Fase B.5).
 *
 * Notas operativas:
 *   - El listener NO emite `task.assigned` ni `task.completed` — eso lo
 *     hace `MaintenanceLogService` directamente. Aquí sólo enviamos la
 *     notificación al **cliente** (no al agente).
 *   - El cliente puede no tener email válido (caso real B2B con cuenta
 *     creada desde admin sin email): si falta, `NotificationsService`
 *     decide internamente (channel `internal` siempre persiste, email
 *     puede no enviarse). Aquí no fallamos.
 *   - Si la plantilla no está seedeada, `dispatchToUser` lo logea como
 *     warning y emite a DLQ (regla R13). EC-T8-30 cubre el riesgo:
 *     plantilla `maintenance.completed` se seedea en este sprint.
 */
@Injectable()
export class MaintenanceCompletedListener {
  private readonly logger = new Logger(MaintenanceCompletedListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('maintenance.completed')
  async handle(payload: MaintenanceCompletedPayload): Promise<void> {
    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );
    const monthLabel = this.formatMonthLabel(payload.monthYear);

    await this.notifications.dispatchToUser(
      'maintenance.completed',
      {
        task_id: payload.taskId,
        maintenance_log_id: payload.maintenanceLogId,
        service_id: payload.serviceId,
        month_year: payload.monthYear,
        month_label: monthLabel,
        notes: payload.notes,
        // Cliente ve detalle de su servicio en el portal cliente
        // (`/dashboard/services/[id]`) — esa página llegará en Sprint 11
        // (Provisioning). Hasta entonces, el link cae al overview del
        // dashboard cliente, que no rompe (degradación elegante).
        action_url: `/dashboard/services/${payload.serviceId}`,
        service_url: `${appUrl}/dashboard/services/${payload.serviceId}`,
      },
      payload.clientId,
    );

    this.logger.log(
      `maintenance.completed dispatched to client ${payload.clientId} (task ${payload.taskId} · ${payload.monthYear})`,
    );
  }

  private formatMonthLabel(monthYear: string): string {
    // monthYear viene como "YYYY-MM" — convertir a "Abril 2026" en es-ES
    const match = /^(\d{4})-(\d{2})$/.exec(monthYear);
    if (!match) return monthYear;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    try {
      return new Date(Date.UTC(year, month, 1)).toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
    } catch {
      return monthYear;
    }
  }
}

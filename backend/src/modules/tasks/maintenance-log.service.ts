import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { ChecklistCompletionService } from './checklist-completion.service';
import { ClientNotesService } from '../clients/client-notes.service';
import { RecordMaintenanceLogDto } from './dto/task.dto';

/**
 * MaintenanceLogService — Sprint 8 Fase B.5 → Sprint 16 (ADR-079).
 *
 * Único entrypoint del flujo "Completar y notificar" canónico para tasks
 * `source_system='support_inside_slot'`. Hace en una sola transacción:
 *
 *   1. Aplica completions opcionales del checklist.
 *   2. Valida que items `is_required=true` están completos. Si falta alguno
 *      devuelve 422 con la lista bloqueante.
 *   3. Crea `maintenance_logs` (1:1 con la task vía UNIQUE) con
 *      `client_facing_notes` (renombrado desde `notes` en Sprint 16).
 *   4. Marca `task.status='completed' + completed_by + completed_at`.
 *   5. Persiste `internal_notes` opcional como `ClientNote` con
 *      `source_system='maintenance_log'` + `triggered_by_action='maintenance.completed'`
 *      vía `ClientNotesService.createFromMaintenanceCompletion`.
 *
 * Tras commit emite `maintenance.completed` (notification al cliente vía
 * Sprint 9 NotificationsService) + `task.completed` (audit). No emite
 * dentro de la transacción para que un fallo del bus no revierta la
 * persistencia.
 */
@Injectable()
export class MaintenanceLogService {
  private readonly logger = new Logger(MaintenanceLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly checklist: ChecklistCompletionService,
    private readonly clientNotes: ClientNotesService,
  ) {}

  async recordCompletion(
    taskId: string,
    dto: RecordMaintenanceLogDto,
    performerId: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        source_system: true,
        source_id: true,
        status: true,
        client_id: true,
      },
    });
    if (!task) throw new NotFoundException('Task no encontrada');
    if (
      ['completed', 'cancelled', 'not_completed_in_time'].includes(task.status)
    ) {
      throw new BadRequestException(
        `Esta tarea está cerrada (estado ${task.status}). Si necesitas retomar el trabajo, crea una tarea nueva.`,
      );
    }
    if (task.source_system !== 'support_inside_slot') {
      throw new BadRequestException(
        'Maintenance log sólo aplica a tasks `support_inside_slot`.',
      );
    }

    // ADR-079: el slot es el `source_id`. Resolvemos el `service_id` desde
    // el slot para persistir el FK del MaintenanceLog (que sigue apuntando a
    // services, no a slots).
    const slot = await this.prisma.supportInsideSlot.findUnique({
      where: { id: task.source_id },
      select: { id: true, service_id: true },
    });
    if (!slot) {
      throw new BadRequestException(
        'El slot vinculado a la task no existe (posiblemente liberado).',
      );
    }

    // Aplicar completions del checklist primero (idempotentes).
    if (dto.checklist_completions && dto.checklist_completions.length > 0) {
      for (const completion of dto.checklist_completions) {
        await this.checklist.complete(taskId, completion, performerId);
      }
    }

    // EC-T8-01: validar items obligatorios completos.
    const productId = await this.resolveProductId(slot.service_id);
    const missing = await this.checklist.findMissingRequiredItems(
      taskId,
      slot.service_id,
      productId,
    );
    if (missing.length > 0) {
      throw new BadRequestException({
        message:
          'Hay items obligatorios del checklist sin completar. No se puede cerrar el mantenimiento.',
        missing_required: missing,
      });
    }

    const monthYear = dto.month_year ?? this.currentMonth();

    const result = await this.prisma.$transaction(async (tx) => {
      const log = await tx.maintenanceLog.create({
        data: {
          task_id: taskId,
          service_id: slot.service_id,
          client_id: task.client_id,
          month_year: monthYear,
          client_facing_notes: dto.client_facing_notes,
          performed_by: performerId,
          metadata: undefined,
        },
      });
      const completed = await tx.task.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          completed_at: new Date(),
          completed_by: performerId,
        },
      });
      return { log, completed };
    });

    // Nota interna canónica → client_notes con source_system='maintenance_log'.
    if (dto.internal_notes?.trim()) {
      try {
        await this.clientNotes.createFromMaintenanceCompletion({
          user_id: task.client_id,
          author_id: performerId,
          slot_id: task.source_id,
          body: dto.internal_notes,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to persist maintenance internal note for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Eventos post-commit.
    this.events.emit('task.completed', {
      task: result.completed,
      completedBy: performerId,
    });
    this.events.emit('maintenance.completed', {
      taskId,
      maintenanceLogId: result.log.id,
      serviceId: result.log.service_id,
      clientId: result.log.client_id,
      monthYear: result.log.month_year,
      completedBy: performerId,
      completedAt: result.completed.completed_at,
      notes: dto.client_facing_notes,
    });

    this.logger.log(
      `maintenance.completed taskId=${taskId} service=${result.log.service_id} month=${monthYear}`,
    );
    return result.log;
  }

  private async resolveProductId(serviceId: string): Promise<string | null> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { product_id: true },
    });
    return service?.product_id ?? null;
  }

  private currentMonth(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
}

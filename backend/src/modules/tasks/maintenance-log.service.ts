import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { ChecklistCompletionService } from './checklist-completion.service';
import { RecordMaintenanceLogDto } from './dto/task.dto';

/**
 * MaintenanceLogService — Sprint 8 Fase B.5 (2026-04-29).
 *
 * Único entrypoint del flujo "Completar y notificar" canónico de UI_SPEC
 * §5.16 para tareas tipo `maintenance` / `maintenance_management`. Hace
 * en una sola transacción atómica:
 *
 *   1. Aplica completions opcionales del checklist (`checklist_completions`).
 *   2. Valida que todos los items `is_required=true` están completados —
 *      EC-T8-01: si falta alguno, devuelve 422 con la lista bloqueante.
 *      Si la task no es `maintenance`/`maintenance_management`, salta
 *      esta validación (tipos sin checklist canónico).
 *   3. Crea fila `maintenance_logs` (1:1 con la task vía UNIQUE).
 *   4. Marca `task.status = 'completed'` + `completed_at = now()`.
 *   5. Persiste `internal_notes` opcional como `ClientNote` con
 *      `task_id` + `category=solution` (paralelo al fix de `tasks.service.complete`).
 *
 * Tras commit emite los eventos `maintenance.completed` (notification al
 * cliente vía Sprint 9 NotificationsService) + `task.completed` (audit).
 * No se emite dentro de la transacción para que un fallo del bus no
 * revierta la persistencia (el flujo Outbox para `maintenance.*` es
 * deuda EC-T8-28 / P-DEPLOY.4 — fuera de scope B.5).
 */
@Injectable()
export class MaintenanceLogService {
  private readonly logger = new Logger(MaintenanceLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly checklist: ChecklistCompletionService,
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
        type: true,
        status: true,
        client_id: true,
        service_id: true,
        billing_month: true,
        service: { select: { product_id: true } },
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

    const isMaintenance = ['maintenance', 'maintenance_management'].includes(
      task.type,
    );

    // Aplicar completions del checklist primero (idempotentes — si el item
    // ya estaba completo, sólo refresca notes). Fuera de la transacción
    // principal porque cada item lleva su propio upsert + validación
    // de existencia. Si algo falla aquí, abortamos antes de crear log.
    if (dto.checklist_completions && dto.checklist_completions.length > 0) {
      for (const completion of dto.checklist_completions) {
        await this.checklist.complete(taskId, completion, performerId);
      }
    }

    // EC-T8-01: validar que items requeridos están completados.
    // Sólo aplica a maintenance/_management — los otros tipos no tienen
    // checklist canónico y la validación bloquearía indebidamente.
    if (isMaintenance) {
      const productId = task.service?.product_id ?? null;
      const missing = await this.checklist.findMissingRequiredItems(
        taskId,
        task.service_id,
        productId,
      );
      if (missing.length > 0) {
        throw new BadRequestException({
          message:
            'Hay items obligatorios del checklist sin completar. No se puede cerrar el mantenimiento.',
          missing_required: missing,
        });
      }
    }

    const monthYear =
      dto.month_year ?? task.billing_month ?? this.currentMonth();

    // Transacción atómica: maintenance_log + task.completed + ClientNote.
    // Si algo falla, todo se revierte. Los eventos se emiten DESPUÉS del
    // commit para no propagar inconsistencia si un listener falla.
    const result = await this.prisma.$transaction(async (tx) => {
      const log = await tx.maintenanceLog.create({
        data: {
          task_id: taskId,
          service_id: task.service_id ?? this.requireServiceId(task),
          client_id: task.client_id,
          month_year: monthYear,
          notes: dto.notes,
          performed_by: performerId,
          metadata: undefined,
        },
      });

      const completed = await tx.task.update({
        where: { id: taskId },
        data: { status: 'completed', completed_at: new Date() },
      });

      let note = null;
      if (dto.internal_notes) {
        note = await tx.clientNote.create({
          data: {
            user_id: task.client_id,
            author_id: performerId,
            category: 'solution',
            body: dto.internal_notes,
            is_pinned: false,
            task_id: taskId,
          },
        });
      }

      return { log, completed, note };
    });

    // Eventos post-commit
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
      notes: dto.notes,
    });

    this.logger.log(
      `maintenance.completed taskId=${taskId} service=${result.log.service_id} month=${monthYear}`,
    );

    return result.log;
  }

  private currentMonth(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * `maintenance_logs.service_id` es NOT NULL en el schema. Si la task
   * de tipo maintenance no tiene `service_id` poblado, el flujo no puede
   * cerrar — es un caso degenerado (mantenimiento sin servicio asociado
   * no tiene sentido operativo). Devolver 422 con mensaje claro.
   */
  private requireServiceId(task: { type: string }): never {
    throw new BadRequestException(
      `Task tipo ${task.type} requiere service_id para registrar maintenance_log. Asocia un servicio antes de cerrar.`,
    );
  }
}

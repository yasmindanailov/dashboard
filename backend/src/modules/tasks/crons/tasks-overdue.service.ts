import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import {
  TASK_SOURCE_SYSTEM_LABELS_ES,
  TASK_PRIORITY_LABELS_ES,
  formatDueLabel,
} from '../task-labels';

const MS_PER_DAY = 86_400_000;
const DEFAULT_OVERDUE_DAYS = 7;

export interface TasksOverdueRunResult {
  processed: number;
  threshold_days: number;
  cutoff: Date;
}

/**
 * TasksOverdueService — Sprint 8 Fase C (2026-05-01).
 *
 * Lógica del cron `tasks-overdue` separada del processor BullMQ para
 * permitir testeo unitario sin Redis y disparo manual desde el endpoint
 * admin de smoke testing (ver `TasksController` `POST /admin/tasks/cron/:name`).
 *
 * Reglas canónicas:
 *  - Sólo afecta a tareas con `assigned_to NOT NULL` (ADR-072 §6: las
 *    tareas en cola pública NO pasan a `not_completed_in_time` automáticamente
 *    porque "no hubo fallo de un agente, hubo fallo de gestión" — esas
 *    las gestiona `TasksUnassignedOverdueService` con alerta al superadmin).
 *  - Sólo afecta a tareas en `pending` o `in_progress`. Las que ya están
 *    en estado terminal (completed/cancelled/not_completed_in_time) se ignoran.
 *  - El umbral `tasks.overdue_to_failure_days` se lee fresco en cada
 *    ejecución (sin snapshot) — coherente con EC-T8-10.
 *
 * Cumple R1 (modula vía eventos), R2 (cron asíncrono), R7 (alerta al agente
 * via NotificationsService a través del listener).
 */
@Injectable()
export class TasksOverdueService {
  private readonly logger = new Logger(TasksOverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async run(now: Date = new Date()): Promise<TasksOverdueRunResult> {
    const days = await this.settings.getNumber(
      'tasks',
      'overdue_to_failure_days',
      DEFAULT_OVERDUE_DAYS,
    );
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY);

    // ADR-072 §6 + invariantes TASK-INV-2: candidatos = tareas con asignado
    // en estado no-terminal cuya `due_date` ya quedó atrás más de N días.
    // El filtro `due_date: { lt: cutoff }` también excluye implícitamente
    // las tareas sin `due_date` (NULL no es < a un Date — semántica SQL).
    const candidates = await this.prisma.task.findMany({
      where: {
        status: { in: ['pending', 'in_progress'] },
        assigned_to: { not: null },
        due_date: { lt: cutoff },
      },
      select: {
        id: true,
        source_system: true,
        source_id: true,
        priority: true,
        assigned_to: true,
        due_date: true,
      },
    });

    if (candidates.length === 0) {
      this.logger.debug(
        `tasks-overdue: no candidates (threshold=${days}d, cutoff=${cutoff.toISOString()})`,
      );
      return { processed: 0, threshold_days: days, cutoff };
    }

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );

    let processed = 0;
    for (const task of candidates) {
      // EC-S8C-01 (registrado en current.md §6): otra ejecución concurrente
      // del cron podría haber marcado ya esta tarea. Compare-and-swap por
      // `status`: el UPDATE sólo afecta filas que SIGUEN en pending/in_progress.
      // Si otra carrera la cerró antes (completed/cancelled) o la marcó como
      // not_completed_in_time, este UPDATE no toca nada y no emitimos evento.
      const result = await this.prisma.task.updateMany({
        where: {
          id: task.id,
          status: { in: ['pending', 'in_progress'] },
        },
        data: { status: 'not_completed_in_time' },
      });
      if (result.count === 0) continue;

      const dueDate = task.due_date as Date;
      const daysOverdue = Math.max(
        1,
        Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY),
      );

      this.events.emit('task.overdue', {
        task_id: task.id,
        task_source_system: task.source_system,
        task_source_id: task.source_id,
        task_source_system_label:
          TASK_SOURCE_SYSTEM_LABELS_ES[task.source_system] ??
          task.source_system,
        task_priority: task.priority,
        task_priority_label:
          TASK_PRIORITY_LABELS_ES[task.priority] ?? task.priority,
        task_url: `${appUrl}/admin/tasks/${task.id}`,
        action_url: `/admin/tasks/${task.id}`,
        due_date_label: formatDueLabel(dueDate),
        days_overdue: daysOverdue,
        assigned_to: task.assigned_to,
      });
      processed += 1;
    }

    this.logger.log(
      `tasks-overdue: ${processed}/${candidates.length} tasks moved to not_completed_in_time (threshold=${days}d)`,
    );
    return { processed, threshold_days: days, cutoff };
  }
}

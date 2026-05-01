import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { TASK_TYPE_LABELS_ES } from '../task-labels';

const MS_PER_HOUR = 3_600_000;

// Tipos cubiertos por SLA. Sigue ADR-072 §"SLA por tipo de tarea". Si se
// añade un valor nuevo al enum `TaskType` que pueda nacer sin asignar,
// añadir aquí + setting `tasks.unassigned_sla_hours.<type>`.
const SLA_TYPES = [
  'contact_client',
  'maintenance',
  'maintenance_management',
  'custom_work',
  'support_setup',
] as const;

export interface UnassignedOverdueTaskRef {
  id: string;
  title: string;
  type: string;
  type_label: string;
  age_hours: number;
  sla_hours: number;
}

export interface TasksUnassignedOverdueRunResult {
  total: number;
  oldest_age_hours: number;
  by_type: Record<string, number>;
}

/**
 * TasksUnassignedOverdueService — Sprint 8 Fase C (2026-05-01).
 *
 * Implementa la doctrina ADR-072 §"Reglas canónicas" §4: cron diario que
 * recorre la cola pública (`assigned_to=null`) y detecta tareas que han
 * superado su SLA por tipo. Si encuentra ≥1, emite evento agregado
 * `task.unassigned_overdue` (1 alerta resumen por ejecución, no 1 por
 * tarea — coherente con `dlq.job_failed` y `outbox.event_failed`).
 *
 * Por qué resumen agregado y no 1 emit por tarea:
 *   - El destinatario es el `superadmin` (1 humano, no un agente por
 *     tarea). N emails individuales serían ruido.
 *   - Permite render Handlebars con `{{summary}}` pre-renderizado en este
 *     listener (declarativo, editable desde Sprint 9.5 sin iterar arrays
 *     en la plantilla).
 *
 * Cumple R1 (event bus), R2 (cron asíncrono), R7 (alerta operativa al
 * responsable) + ADR-072 §4 + ADR-042/065.
 */
@Injectable()
export class TasksUnassignedOverdueService {
  private readonly logger = new Logger(TasksUnassignedOverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly settings: SettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<TasksUnassignedOverdueRunResult> {
    // Fallback global; cada tipo lo override con su entrada específica si
    // existe en la BD (ADR-072 §4).
    const defaultSla = await this.settings.getNumber(
      'tasks',
      'unassigned_sla_hours.default',
      24,
    );

    // Lee SLA por tipo en paralelo (cada uno hace cache hit tras la 1ª).
    const slaByType = new Map<string, number>();
    for (const type of SLA_TYPES) {
      const sla = await this.settings.getNumber(
        'tasks',
        `unassigned_sla_hours.${type}`,
        defaultSla,
      );
      slaByType.set(type, sla);
    }

    // Selección base: tareas en cola pública en estado no-terminal. Trae
    // las mínimas columnas necesarias para evaluar SLA por tipo y armar
    // el `summary` del evento.
    const candidates = await this.prisma.task.findMany({
      where: {
        assigned_to: null,
        status: { in: ['pending', 'in_progress'] },
      },
      select: {
        id: true,
        title: true,
        type: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const overdue: UnassignedOverdueTaskRef[] = [];
    const byType: Record<string, number> = {};

    for (const task of candidates) {
      const sla = slaByType.get(task.type) ?? defaultSla;
      const ageHours = Math.floor(
        (now.getTime() - task.created_at.getTime()) / MS_PER_HOUR,
      );
      if (ageHours < sla) continue;

      overdue.push({
        id: task.id,
        title: task.title,
        type: task.type,
        type_label: TASK_TYPE_LABELS_ES[task.type] ?? task.type,
        age_hours: ageHours,
        sla_hours: sla,
      });
      byType[task.type] = (byType[task.type] ?? 0) + 1;
    }

    if (overdue.length === 0) {
      this.logger.debug(
        `tasks-unassigned-overdue: no candidates (${candidates.length} in queue, none past SLA)`,
      );
      return { total: 0, oldest_age_hours: 0, by_type: {} };
    }

    // `summary` pre-renderizado: una línea por tarea con tipo + edad + SLA.
    // Hasta 20 entradas para evitar emails kilométricos; si hay más, añade
    // el contador "+ N más". El admin investiga el resto en
    // `/admin/tasks?scope=unassigned`.
    const MAX_LINES = 20;
    const summaryLines = overdue
      .slice(0, MAX_LINES)
      .map(
        (t) =>
          `• [${t.type_label}] ${t.title} — ${t.age_hours}h (SLA ${t.sla_hours}h)`,
      );
    if (overdue.length > MAX_LINES) {
      summaryLines.push(`… y ${overdue.length - MAX_LINES} más`);
    }
    const summary = summaryLines.join('\n');

    const oldest = overdue.reduce(
      (max, t) => (t.age_hours > max ? t.age_hours : max),
      0,
    );

    this.events.emit('task.unassigned_overdue', {
      total: overdue.length,
      oldest_age_hours: oldest,
      by_type: byType,
      task_ids: overdue.map((t) => t.id),
      summary,
    });

    this.logger.log(
      `tasks-unassigned-overdue: ${overdue.length} tasks past SLA (oldest ${oldest}h)`,
    );

    return {
      total: overdue.length,
      oldest_age_hours: oldest,
      by_type: byType,
    };
  }

  /** Helper expuesto para tests: la lista canónica de tipos con SLA. */
  static slaTypes(): ReadonlyArray<string> {
    return SLA_TYPES;
  }
}

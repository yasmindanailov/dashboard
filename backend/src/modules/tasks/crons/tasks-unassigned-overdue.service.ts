import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskSourceSystem } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { TASK_SOURCE_SYSTEM_LABELS_ES } from '../task-labels';

const MS_PER_HOUR = 3_600_000;

/**
 * Sprint 16 (ADR-079): los `source_system` que pueden nacer en cola pública
 * y por tanto son candidatos a SLA "tarea sin asignar". `support_ticket` se
 * excluye porque el ticket llega siempre asignado al agente desde module
 * support (auto-asignación canónica) — la task bridge nace con `assigned_to`.
 */
const SLA_SOURCE_SYSTEMS: ReadonlyArray<TaskSourceSystem> = [
  'support_inside_slot',
  'provisioning_manual',
  'client_lifecycle',
  'project',
];

export interface UnassignedOverdueTaskRef {
  id: string;
  source_system: TaskSourceSystem;
  source_id: string;
  source_label: string;
  age_hours: number;
  sla_hours: number;
}

export interface TasksUnassignedOverdueRunResult {
  total: number;
  oldest_age_hours: number;
  by_source_system: Record<string, number>;
}

/**
 * TasksUnassignedOverdueService — Sprint 8 Fase C → Sprint 16 (ADR-079 §3.1).
 *
 * Cron diario que recorre la cola pública (`assigned_to=null`) y detecta
 * tasks que han superado su SLA por `source_system`. Si encuentra ≥1, emite
 * evento agregado `task.unassigned_overdue` (1 alerta resumen — coherente
 * con `dlq.job_failed` y `outbox.event_failed`).
 *
 * Settings consumidos: `tasks.unassigned_sla_hours.<source_system>` con
 * fallback a `tasks.unassigned_sla_hours.default`. Los nombres de los keys
 * cambiaron en Sprint 16 (de `<task_type>` a `<source_system>`); el seed
 * canónico de settings se actualiza en consecuencia.
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
    const defaultSla = await this.settings.getNumber(
      'tasks',
      'unassigned_sla_hours.default',
      24,
    );

    const slaBySource = new Map<TaskSourceSystem, number>();
    for (const src of SLA_SOURCE_SYSTEMS) {
      const sla = await this.settings.getNumber(
        'tasks',
        `unassigned_sla_hours.${src}`,
        defaultSla,
      );
      slaBySource.set(src, sla);
    }

    const candidates = await this.prisma.task.findMany({
      where: {
        assigned_to: null,
        status: { in: ['pending', 'in_progress'] },
      },
      select: {
        id: true,
        source_system: true,
        source_id: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const overdue: UnassignedOverdueTaskRef[] = [];
    const bySource: Record<string, number> = {};

    for (const task of candidates) {
      const sla = slaBySource.get(task.source_system) ?? defaultSla;
      const ageHours = Math.floor(
        (now.getTime() - task.created_at.getTime()) / MS_PER_HOUR,
      );
      if (ageHours < sla) continue;

      overdue.push({
        id: task.id,
        source_system: task.source_system,
        source_id: task.source_id,
        source_label:
          TASK_SOURCE_SYSTEM_LABELS_ES[task.source_system] ??
          task.source_system,
        age_hours: ageHours,
        sla_hours: sla,
      });
      bySource[task.source_system] = (bySource[task.source_system] ?? 0) + 1;
    }

    if (overdue.length === 0) {
      this.logger.debug(
        `tasks-unassigned-overdue: no candidates (${candidates.length} in queue, none past SLA)`,
      );
      return { total: 0, oldest_age_hours: 0, by_source_system: {} };
    }

    const MAX_LINES = 20;
    const summaryLines = overdue
      .slice(0, MAX_LINES)
      .map(
        (t) =>
          `• [${t.source_label}] ${t.source_id} — ${t.age_hours}h (SLA ${t.sla_hours}h)`,
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
      by_source_system: bySource,
      task_ids: overdue.map((t) => t.id),
      summary,
    });

    this.logger.log(
      `tasks-unassigned-overdue: ${overdue.length} tasks past SLA (oldest ${oldest}h)`,
    );

    return {
      total: overdue.length,
      oldest_age_hours: oldest,
      by_source_system: bySource,
    };
  }

  /** Helper expuesto para tests. */
  static slaSourceSystems(): ReadonlyArray<TaskSourceSystem> {
    return SLA_SOURCE_SYSTEMS;
  }
}

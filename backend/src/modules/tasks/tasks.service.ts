/* ═══════════════════════════════════════
   TasksService — Sprint 16 Fase 16.B (ADR-079)
   Bridge unidireccional read-only sobre 5 source_systems canónicos.
   API pública: createFromTrigger (interno), assign, complete, cancel,
   findOne, findAll, getStats. SIN crear manual ni update libre.
   ═══════════════════════════════════════ */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  TaskSourceSystem,
  TaskStatus,
  TaskPriority,
  NoteCategory,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { SupportService } from '../support/support.service';
import { ClientNotesService } from '../clients/client-notes.service';
import {
  AssignTaskDto,
  CompleteTaskDto,
  CancelTaskDto,
  TaskListQueryDto,
  TaskScopeDto,
  TicketActionDto,
  TicketBridgeCompletionDto,
} from './dto/task.dto';
import { applyCanonicalOrdering } from '../../core/tasks/list-ordering';

const ASSIGNABLE_ROLES = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
];

const ADMIN_ROLES = ['superadmin', 'agent_full'];

const INCLUDE_RELATIONS = {
  assignee: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  client: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  completer: {
    select: { id: true, first_name: true, last_name: true },
  },
} as const;

/**
 * Categoría canónica de la nota generada al completar una task no-bridge.
 * ADR-079 §3.9: la categoría se infiere del `source_system`, NO la elige el
 * agente — alinea la timeline del cliente con el flujo origen.
 */
const TASK_COMPLETION_NOTE_CATEGORY: Partial<
  Record<TaskSourceSystem, NoteCategory>
> = {
  provisioning_manual: NoteCategory.support,
  client_lifecycle: NoteCategory.onboarding,
  project: NoteCategory.project,
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly support: SupportService,
    private readonly clientNotes: ClientNotesService,
  ) {}

  /* ────────────────────────────────────────────────────────────────────
     CREATE (interno — usado por listeners canónicos, no por endpoint público)
     ──────────────────────────────────────────────────────────────────── */

  /**
   * Punto único de creación canónica. Lo invocan los 5 listeners trigger
   * (support-ticket / maintenance-monthly / provisioning-orchestrator /
   * client-lifecycle / project-promote). NO existe endpoint REST que lo
   * exponga: la creación manual quedó cerrada por ADR-079 §1.
   *
   * Idempotencia: el UNIQUE INDEX parcial canónico
   * `tasks_uniq_active_per_source` rechaza una segunda task con el mismo
   * `(source_system, source_id)` mientras la previa esté en `pending` o
   * `in_progress`. Capturamos P2002 y devolvemos la task existente.
   */
  async createFromTrigger(input: {
    source_system: TaskSourceSystem;
    source_id: string;
    client_id: string;
    assigned_to?: string | null;
    priority?: TaskPriority;
    due_date?: Date | null;
  }) {
    try {
      const task = await this.prisma.task.create({
        data: {
          source_system: input.source_system,
          source_id: input.source_id,
          client_id: input.client_id,
          assigned_to: input.assigned_to ?? null,
          priority: input.priority ?? 'medium',
          due_date: input.due_date ?? null,
          status: 'pending',
        },
        include: INCLUDE_RELATIONS,
      });
      this.events.emit('task.created', { task });
      if (task.assigned_to) {
        this.events.emit('task.assigned', { task, assignedBy: 'system' });
      }
      this.logger.log(
        `Task created: ${task.id} [${task.source_system}] source=${task.source_id} client=${task.client_id} assigned_to=${task.assigned_to ?? 'cola'}`,
      );
      return task;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Idempotente: ya existe una task activa para (source_system, source_id).
        // Devolvemos la existente — el listener decide si reasigna o ignora.
        const existing = await this.prisma.task.findFirst({
          where: {
            source_system: input.source_system,
            source_id: input.source_id,
            status: { in: ['pending', 'in_progress'] },
          },
          include: INCLUDE_RELATIONS,
        });
        if (existing) {
          this.logger.debug(
            `Task already active for ${input.source_system}/${input.source_id} → returning existing ${existing.id}`,
          );
          // Marcador interno (no persistido) para que callers puedan
          // distinguir "creación nueva" vs "idempotent hit". Cumple R7.
          return { ...existing, __idempotent_hit: true as const };
        }
      }
      throw err;
    }
  }

  /* ────────────────────────────────────────────────────────────────────
     READ — listado + detalle + stats
     ──────────────────────────────────────────────────────────────────── */

  async findAll(query: TaskListQueryDto, userId: string, isAdmin: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TaskWhereInput = {};

    if (query.scope === TaskScopeDto.mine) {
      where.assigned_to = userId;
    } else if (query.scope === TaskScopeDto.unassigned) {
      where.assigned_to = null;
    } else if (query.scope === TaskScopeDto.all) {
      // sólo staff puede pedir 'all' explícitamente; CASL hace el corte.
    } else if (!isAdmin) {
      // sin scope explícito: agente ve mine + unassigned mezcladas.
      where.OR = [{ assigned_to: userId }, { assigned_to: null }];
    }

    if (query.status) where.status = query.status;
    if (query.source_system) where.source_system = query.source_system;
    if (query.priority) where.priority = query.priority;
    if (query.client_id) where.client_id = query.client_id;
    if (query.source_id) where.source_id = query.source_id;
    if (
      query.assigned_to &&
      query.scope !== TaskScopeDto.mine &&
      query.scope !== TaskScopeDto.unassigned
    ) {
      where.assigned_to = query.assigned_to;
    }

    if (query.time_range === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.due_date = { gte: start, lte: end };
      where.status = { notIn: ['completed', 'cancelled'] };
    } else if (query.time_range === 'week') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + (7 - end.getDay()));
      end.setHours(23, 59, 59, 999);
      where.due_date = { gte: start, lte: end };
      where.status = { notIn: ['completed', 'cancelled'] };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: INCLUDE_RELATIONS,
        // Orden de fallback en SQL — el orden canónico cross-bloque se aplica
        // in-memory con `applyCanonicalOrdering` sobre la página.
        orderBy: [{ created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: applyCanonicalOrdering(data),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: INCLUDE_RELATIONS,
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return task;
  }

  async getStats(userId: string, isAdmin: boolean, scope?: TaskScopeDto) {
    let baseWhere: Prisma.TaskWhereInput;
    if (scope === TaskScopeDto.mine) {
      baseWhere = { assigned_to: userId };
    } else if (scope === TaskScopeDto.unassigned) {
      baseWhere = { assigned_to: null };
    } else if (scope === TaskScopeDto.all) {
      baseWhere = {};
    } else {
      baseWhere = isAdmin
        ? {}
        : { OR: [{ assigned_to: userId }, { assigned_to: null }] };
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    weekEnd.setHours(23, 59, 59, 999);

    const [today, thisWeek, pending, completed] =
      await this.prisma.$transaction([
        this.prisma.task.count({
          where: {
            ...baseWhere,
            due_date: { gte: todayStart, lte: todayEnd },
            status: { notIn: ['completed', 'cancelled'] },
          },
        }),
        this.prisma.task.count({
          where: {
            ...baseWhere,
            due_date: { gte: todayStart, lte: weekEnd },
            status: { notIn: ['completed', 'cancelled'] },
          },
        }),
        this.prisma.task.count({
          where: { ...baseWhere, status: { in: ['pending', 'in_progress'] } },
        }),
        this.prisma.task.count({
          where: { ...baseWhere, status: 'completed' },
        }),
      ]);

    return { today, this_week: thisWeek, pending, completed };
  }

  /* ────────────────────────────────────────────────────────────────────
     ASSIGN — auto-asignación, reasignación, liberación a cola pública
     ──────────────────────────────────────────────────────────────────── */

  /**
   * Reglas canónicas (ADR-079 §3.10):
   *  - Admin (superadmin / agent_full): puede asignar a cualquier agente.
   *  - Staff con `Manage.Task`: sólo puede AUTO-asignarse desde la cola
   *    pública (`existing.assigned_to=null && dto.assigned_to=userId`).
   *  - Liberación a cola pública (`assigned_to=null`): admin pleno o el
   *    propio asignado pueden liberar.
   *  - Tasks en estado terminal: rechazadas con 400.
   */
  async assign(
    id: string,
    dto: AssignTaskDto,
    userId: string,
    isAdmin: boolean,
    opts: { skipTicketSync?: boolean } = {},
  ) {
    const existing = await this.findOne(id);

    if (this.isTerminal(existing.status)) {
      throw new BadRequestException(
        `Esta tarea está cerrada (estado ${existing.status}). No se puede reasignar.`,
      );
    }

    const targetAgent = dto.assigned_to ?? null;

    if (targetAgent === existing.assigned_to) {
      // No-op explícito: idempotente.
      return existing;
    }

    const isClaimingFromPool =
      existing.assigned_to === null && targetAgent === userId;
    const isReleasingOwn =
      existing.assigned_to === userId && targetAgent === null;

    if (!isAdmin && !isClaimingFromPool && !isReleasingOwn) {
      throw new ForbiddenException(
        'Sólo el admin puede reasignar tasks de otros agentes.',
      );
    }

    if (targetAgent !== null) {
      await this.assertAssignableUser(targetAgent);
    }

    /*
     * Bridge `support_ticket`: ADR-079 §1 — el sistema vinculado es la única
     * fuente de verdad. Cuando la operación viene del usuario (NO del listener),
     * propagamos al ticket vía `support.updateConversation`; el listener
     * `SupportTicketTaskCreatorListener` actualiza la task de forma idempotente
     * en respuesta al evento del ticket (handleAssigned upserta con nuevo
     * `assigned_to`; handleUnassigned cancela la task — ADR-074 EC#8).
     *
     * `opts.skipTicketSync=true` rompe el loop cuando el listener nos invoca
     * (mismo patrón que `cancel` con `skipTicketRelease`). En ese caso
     * actualizamos la task directamente — el ticket ya está al día, fue su
     * cambio el que disparó al listener.
     *
     * Sprint 13 §13.AUTH Fase F bug #3b (Yasmin 2026-05-03/04).
     */
    if (existing.source_system === 'support_ticket' && !opts.skipTicketSync) {
      try {
        await this.support.updateConversation(
          existing.source_id,
          { assigned_agent_id: targetAgent },
          userId,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to sync ticket ${existing.source_id} on task assign: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
      // El listener ya actualizó la task; releemos el estado fresco.
      return this.findOne(id);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        assigned_to: targetAgent,
        // Marcar in_progress al claim si aún está pending — UX coherente:
        // el agente que abre/asume la task ya está "trabajando en ella".
        ...(targetAgent && existing.status === 'pending'
          ? { status: TaskStatus.in_progress }
          : {}),
      },
      include: INCLUDE_RELATIONS,
    });

    if (targetAgent) {
      this.events.emit('task.assigned', { task: updated, assignedBy: userId });
    }

    return updated;
  }

  /* ────────────────────────────────────────────────────────────────────
     COMPLETE — cierre canónico con delegación al sistema vinculado
     ──────────────────────────────────────────────────────────────────── */

  /**
   * Cierre de una task no-bridge. Aplica a `provisioning_manual`,
   * `client_lifecycle` y `project`. La nota es OBLIGATORIA según ADR-079
   * §3.9 — se persiste en `client_notes` con `source_system='task_completion'`
   * + categoría inferida del flujo origen.
   *
   * Tasks `support_ticket` → usan `completeTicketBridge`.
   * Tasks `support_inside_slot` → usan `MaintenanceLogService.recordCompletion`.
   * Si llegan aquí por error, devolvemos 400 con guía explícita.
   */
  async complete(id: string, dto: CompleteTaskDto, userId: string) {
    const task = await this.findOne(id);
    if (this.isTerminal(task.status)) {
      throw new BadRequestException('Esta tarea ya está cerrada');
    }

    if (task.source_system === 'support_ticket') {
      throw new BadRequestException(
        'Tasks de soporte se cierran vía bridge — usa POST /tasks/:id/complete-ticket-bridge.',
      );
    }
    if (task.source_system === 'support_inside_slot') {
      throw new BadRequestException(
        'Tasks de mantenimiento se cierran vía POST /tasks/:id/maintenance/log.',
      );
    }

    if (!dto.note?.trim()) {
      throw new BadRequestException(
        'La nota de cierre es obligatoria para este tipo de tarea.',
      );
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          completed_by: userId,
        },
        include: INCLUDE_RELATIONS,
      });
      await tx.clientNote.create({
        data: {
          user_id: task.client_id,
          author_id: userId,
          category:
            TASK_COMPLETION_NOTE_CATEGORY[task.source_system] ??
            NoteCategory.support,
          source_system: 'task_completion',
          source_id: task.id,
          triggered_by_action: 'task.completed',
          body: dto.note!,
          is_pinned: false,
        },
      });
      return updated;
    });

    this.events.emit('task.completed', {
      task: completed,
      completedBy: userId,
    });
    this.logger.log(
      `Task completed: ${id} [${task.source_system}] by ${userId}`,
    );
    return completed;
  }

  /**
   * Cierre de bridge ticket↔task. Delega en SupportService para que el
   * módulo support sea single-source-of-truth de la transición del ticket
   * y la nota canónica al cliente.
   */
  async completeTicketBridge(
    id: string,
    dto: TicketBridgeCompletionDto,
    userId: string,
  ) {
    const task = await this.findOne(id);
    if (this.isTerminal(task.status)) {
      throw new BadRequestException('Esta tarea ya está cerrada');
    }
    if (task.source_system !== 'support_ticket') {
      throw new BadRequestException(
        'Esta task no es bridge de ticket — usa POST /tasks/:id/complete.',
      );
    }
    if (!dto.resolution_note?.trim()) {
      throw new BadRequestException(
        'La nota interna sobre la resolución del ticket es obligatoria.',
      );
    }

    const newStatus =
      dto.ticket_action === TicketActionDto.resolve ? 'resolved' : 'closed';

    // 1. Delegar al módulo support — persiste ClientNote canónico
    //    (source_system='ticket'), emite conversation.resolved/closed +
    //    notifica al cliente vía su listener.
    await this.support.updateConversation(
      task.source_id,
      { status: newStatus, resolution_note: dto.resolution_note },
      userId,
    );

    // 2. Cerrar la task.
    const completed = await this.prisma.task.update({
      where: { id },
      data: {
        status: 'completed',
        completed_at: new Date(),
        completed_by: userId,
      },
      include: INCLUDE_RELATIONS,
    });

    this.events.emit('task.completed', {
      task: completed,
      completedBy: userId,
      __skipClientNotification: true,
    });
    this.logger.log(
      `Task ${id} (support_ticket) bridge-closed → ticket ${task.source_id} → ${newStatus}`,
    );
    return completed;
  }

  /* ────────────────────────────────────────────────────────────────────
     CANCEL — sin nota obligatoria (ADR-079 §3.9 excepción)
     ──────────────────────────────────────────────────────────────────── */

  /**
   * Cancela una task. Si la task es bridge de ticket, libera el ticket
   * (`assigned_agent_id=null`). El flag `skipTicketRelease` permite a
   * listeners cross-sistema (`tasks-on-slot-released`,
   * `tasks-on-service-cancelled`, listener `conversation.unassigned`)
   * cancelar SIN re-disparar la liberación — el sistema vinculado ya se
   * actualizó.
   */
  async cancel(
    id: string,
    dto: CancelTaskDto,
    userId: string,
    opts: { skipTicketRelease?: boolean } = {},
  ) {
    const task = await this.findOne(id);
    if (this.isTerminal(task.status)) {
      throw new BadRequestException('Esta tarea ya está cerrada');
    }

    const cancelled = await this.prisma.task.update({
      where: { id },
      data: {
        status: 'cancelled',
        completed_at: new Date(),
        completed_by: userId,
      },
      include: INCLUDE_RELATIONS,
    });

    let ticketReleased = false;
    if (task.source_system === 'support_ticket' && !opts.skipTicketRelease) {
      try {
        await this.support.updateConversation(
          task.source_id,
          { assigned_agent_id: null },
          userId,
        );
        ticketReleased = true;
      } catch (err) {
        this.logger.warn(
          `Failed to release ticket ${task.source_id} after task cancel: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.events.emit('task.cancelled', {
      task: cancelled,
      cancelledBy: userId,
      reason: dto.reason ?? null,
    });
    this.logger.log(
      `Task cancelled: ${id} [${task.source_system}] by ${userId} reason=${dto.reason ?? 'n/a'}`,
    );

    return ticketReleased
      ? { ...cancelled, __ticket_released: true as const }
      : cancelled;
  }

  /* ────────────────────────────────────────────────────────────────────
     Helpers privados
     ──────────────────────────────────────────────────────────────────── */

  private isTerminal(status: TaskStatus): boolean {
    return (
      status === 'completed' ||
      status === 'cancelled' ||
      status === 'not_completed_in_time'
    );
  }

  /**
   * Validación FK + rol asignable. Cumple deuda histórica A4 (Sprint 8 P0.1).
   * Cuando un listener asigna `assigned_to=null` (cola pública), no invoca
   * este helper.
   */
  private async assertAssignableUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: { select: { slug: true } } },
    });
    if (!user) {
      throw new BadRequestException('El usuario asignado no existe');
    }
    if (user.status !== 'active') {
      throw new BadRequestException('El usuario asignado no está activo');
    }
    if (!ASSIGNABLE_ROLES.includes(user.role.slug)) {
      throw new BadRequestException(
        'Solo se pueden asignar tareas a admins o agentes',
      );
    }
  }

  /* ── Helper público para listeners externos: detectar si un user es admin. ── */
  static isAdmin(roleSlug: string): boolean {
    return ADMIN_ROLES.includes(roleSlug);
  }
}

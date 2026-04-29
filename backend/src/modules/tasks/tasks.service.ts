/* ═══════════════════════════════════════
   TasksService — CRUD + assignment + transitions
   Facade pattern: under 300 lines (Regla 15).
   Ref: DECISIONS.md §10, ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CompleteTaskDto,
  TaskListQueryDto,
  TaskScopeDto,
  TaskStatusDto,
} from './dto/task.dto';
import { Prisma } from '@prisma/client';

const INCLUDE_RELATIONS = {
  assignee: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  creator: { select: { id: true, first_name: true, last_name: true } },
  client: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
};

/**
 * Sprint 8 Fase B.2 (2026-04-29) — UI_SPEC §5.16 sidebar "Servicio" + bloque
 * adaptativo wow_call que muestra "servicio contratado, plan". Versión más
 * rica de INCLUDE para `findOne()` solamente — la lista (`findAll`) sigue
 * con `INCLUDE_RELATIONS` para no degradar la query con N+1 implícito.
 */
const INCLUDE_RELATIONS_DETAIL = {
  ...INCLUDE_RELATIONS,
  service: {
    select: {
      id: true,
      label: true,
      domain: true,
      status: true,
      amount: true,
      billing_cycle: true,
      currency: true,
      product: { select: { id: true, name: true, slug: true, type: true } },
    },
  },
};

const ASSIGNABLE_ROLES = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
];

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  /* ── Validate assignee FK + role (TASK-INV deuda A4) ── */
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

  /* ── Create ── */
  async create(dto: CreateTaskDto, creatorId: string) {
    if (dto.assigned_to) {
      await this.assertAssignableUser(dto.assigned_to);
    }
    const task = await this.prisma.task.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'medium',
        client_id: dto.client_id,
        service_id: dto.service_id,
        assigned_to: dto.assigned_to,
        client_note: dto.client_note,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        created_by: creatorId,
      },
      include: INCLUDE_RELATIONS,
    });
    this.events.emit('task.created', { task });
    if (dto.assigned_to) {
      this.events.emit('task.assigned', { task, assignedBy: creatorId });
    }
    this.logger.log(
      `Task created: ${task.id} [${task.type}] for client ${task.client_id}`,
    );
    return task;
  }

  /* ── Find all (paginated, filtered) ── */
  async findAll(query: TaskListQueryDto, userId: string, isAdmin: boolean) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: Prisma.TaskWhereInput = {};

    // Sprint 8.B.1.bis (2026-04-29) — scope segmenta la vista del tablero
    // según UI_SPEC §5.15 (Mis tareas / Sin asignar / Todas). Tiene
    // precedencia sobre el role-based filtering legacy: si el frontend
    // pide explícitamente `scope=mine|unassigned|all`, respeta esa
    // intención. Si no llega `scope`, mantiene el comportamiento previo
    // (agente ve `mine + unassigned` mezcladas, admin ve todas).
    if (query.scope === TaskScopeDto.mine) {
      where.assigned_to = userId;
    } else if (query.scope === TaskScopeDto.unassigned) {
      where.assigned_to = null;
    } else if (query.scope === TaskScopeDto.all) {
      // sólo staff puede pedir 'all' explícitamente; si un cliente lo
      // pidiera, el guard CASL ya habría rechazado antes (List.Task no
      // existe para client). Aquí simplemente no añadimos filtro.
    } else if (!isAdmin) {
      // legacy fallback: agente sin scope explícito ve mine + unassigned.
      where.OR = [{ assigned_to: userId }, { assigned_to: null }];
    }
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    // El filtro por agente concreto sólo se aplica cuando el scope no es
    // 'mine' (en mine ya está implícito) ni 'unassigned' (incompatible).
    if (
      query.assigned_to &&
      query.scope !== TaskScopeDto.mine &&
      query.scope !== TaskScopeDto.unassigned
    ) {
      where.assigned_to = query.assigned_to;
    }
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }
    // Time range filters
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
        orderBy: [
          { priority: 'desc' },
          { due_date: 'asc' },
          { created_at: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /* ── Find one ──
     Sprint 8 Fase B.2 (2026-04-29): incluye `service` + `product` (UI_SPEC
     §5.16 sidebar Servicio + bloque wow_call). La lista (`findAll`) sigue
     con `INCLUDE_RELATIONS` ligero para no penalizar el tablero con joins
     innecesarios — el detail carga lo extra solo cuando hace falta. */
  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: INCLUDE_RELATIONS_DETAIL,
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return task;
  }

  /* ── Update ──
     Sprint 8 Fase B.1.bis (2026-04-29) — refactor coherente tras auditoría
     de edge cases (ver `current.md` §6 EC-T8-19 / EC-T8-20 / EC-T8-21 /
     EC-T8-22) y la doctrina actualizada de cola pública (ADR-072).
  */
  async update(
    id: string,
    dto: UpdateTaskDto,
    userId: string,
    isAdmin: boolean,
  ) {
    const existing = await this.findOne(id);

    // EC-T8-19/20/21 — refuerzo doctrina ADR-041 §"completada nunca se
    // reabre". Una tarea en estado terminal (completed | cancelled |
    // not_completed_in_time) NO admite cambios de status, priority,
    // assigned_to ni due_date. Sólo `client_note` (texto libre del agente
    // sobre lo que ocurrió) y `description` se permiten editar como
    // anexo informativo. Si necesita retomarse el trabajo, se crea una
    // tarea nueva (auditabilidad).
    const TERMINAL_STATES: readonly string[] = [
      'completed',
      'cancelled',
      'not_completed_in_time',
    ];
    const isTerminal = TERMINAL_STATES.includes(existing.status);
    if (isTerminal) {
      const blocked: string[] = [];
      if (
        dto.status !== undefined &&
        (dto.status as string) !== (existing.status as string)
      ) {
        blocked.push('status');
      }
      if (
        dto.priority !== undefined &&
        (dto.priority as string) !== (existing.priority as string)
      ) {
        blocked.push('priority');
      }
      if (
        dto.assigned_to !== undefined &&
        dto.assigned_to !== existing.assigned_to
      ) {
        blocked.push('assigned_to');
      }
      if (dto.due_date !== undefined) blocked.push('due_date');
      if (blocked.length > 0) {
        throw new BadRequestException(
          `Esta tarea está cerrada (estado ${existing.status}). No se puede modificar: ${blocked.join(', ')}. Si necesitas retomar el trabajo, crea una tarea nueva.`,
        );
      }
    }

    // EC-T8-22 — cola pública (ADR-072). Reglas de autorización para
    // editar una tarea, en orden de evaluación:
    //
    //   1. Admin pleno (`superadmin` + `agent_full`) — puede editar
    //      cualquier tarea (sin cambio respecto a antes).
    //   2. Staff con `Manage.Task` que es `assigned_to` actual — puede
    //      editar la suya (sin cambio respecto a antes).
    //   3. Staff con `Manage.Task` tomando una tarea de la cola pública
    //      (`existing.assigned_to === null` y la única intención del PATCH
    //      es auto-asignarse: `dto.assigned_to === userId`) — permitido
    //      por ADR-072.
    //   4. Cualquier otro staff editando tarea ajena — 403 (la regla
    //      anti-deriva de ADR-041 sigue vigente para tareas con owner).
    //
    // Nota: el guard `Manage.Task` lo da el PoliciesGuard del controller
    // (CASL para los 4 staff por ADR-067). Aquí sólo distinguimos casos.
    const isClaimingFromPool =
      existing.assigned_to === null && dto.assigned_to === userId;
    const isOwnTask = existing.assigned_to === userId;
    if (!isAdmin && !isOwnTask && !isClaimingFromPool) {
      throw new ForbiddenException(
        'No puedes modificar tareas de otros agentes',
      );
    }

    if (
      dto.assigned_to !== undefined &&
      dto.assigned_to !== null &&
      dto.assigned_to !== existing.assigned_to
    ) {
      await this.assertAssignableUser(dto.assigned_to);
    }
    const wasAssigned = existing.assigned_to;
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.assigned_to !== undefined && { assigned_to: dto.assigned_to }),
        ...(dto.due_date !== undefined && { due_date: new Date(dto.due_date) }),
        ...(dto.client_note !== undefined && { client_note: dto.client_note }),
        ...(dto.status === TaskStatusDto.completed && {
          completed_at: new Date(),
        }),
      },
      include: INCLUDE_RELATIONS,
    });
    // Emit assignment event if agent changed (incluye auto-asignación
    // desde la cola pública: `assignedBy = userId` igual que cualquier
    // otra reasignación — auditoría coherente con ADR-072).
    if (dto.assigned_to && dto.assigned_to !== wasAssigned) {
      this.events.emit('task.assigned', { task, assignedBy: userId });
    }
    // Emit status change events
    if (dto.status === TaskStatusDto.completed) {
      this.events.emit('task.completed', { task, completedBy: userId });
    }
    return task;
  }

  /* ── Complete with notes (maintenance flow) ── */
  async complete(id: string, dto: CompleteTaskDto, userId: string) {
    const task = await this.findOne(id);
    if (['completed', 'cancelled'].includes(task.status)) {
      throw new BadRequestException('Esta tarea ya está cerrada');
    }
    const completed = await this.prisma.task.update({
      where: { id },
      data: { status: 'completed', completed_at: new Date() },
      include: INCLUDE_RELATIONS,
    });
    // Sprint 8 Fase B.1.bis (2026-04-29): persistir notas internas como
    // ClientNote estructurada vinculada a la task.
    //
    // Cambios respecto al comportamiento anterior:
    //   1. category = 'solution' (no 'technical') — coherente con ADR-038/
    //      ADR-039: las notas al cerrar son del tipo "solución" canónica,
    //      no notas técnicas sueltas. Permite que la timeline del cliente
    //      las muestre con el tono correcto.
    //   2. task_id poblado — Sprint 8 Fase A añadió este FK; el
    //      ClientNotesTab agrupa por origen (task) en la timeline igual
    //      que ya hace por conversation_id. Este es el equivalente
    //      "enlace a la fuente" que las notas de conversaciones tienen
    //      hacia su ticket origen.
    //   3. Aplica a CUALQUIER task que tenga internal_notes — no sólo
    //      maintenance (el comentario antiguo era engañoso). El Sprint
    //      8.B.5 añadirá MaintenanceLog específico para tareas de
    //      mantenimiento; mientras tanto, la nota estructurada es
    //      suficiente para la trazabilidad básica.
    if (dto.internal_notes && task.client_id) {
      try {
        await this.prisma.clientNote.create({
          data: {
            user_id: task.client_id,
            author_id: userId,
            category: 'solution',
            body: dto.internal_notes,
            is_pinned: false,
            task_id: task.id,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to create client note for task ${id}: ${err}`);
      }
    }
    this.events.emit('task.completed', {
      task: completed,
      completedBy: userId,
      clientNotes: dto.client_notes,
      internalNotes: dto.internal_notes,
    });
    this.logger.log(`Task completed: ${id} [${task.type}] by ${userId}`);
    return completed;
  }

  /* ── Stats ──
     Sprint 8.B.1.bis: respeta el `scope` igual que `findAll`. Sin esta
     coherencia, los contadores de StatusTabs (Hoy/Semana/Pendientes/
     Completadas) muestran cifras del conjunto global aunque el usuario
     esté en una vista segmentada (Mis tareas / Sin asignar / Todas) —
     bug visible cuando, p.ej., en "Sin asignar" el tab Pendientes dice
     "5" pero al entrar la tabla está vacía. */
  async getStats(userId: string, isAdmin: boolean, scope?: TaskScopeDto) {
    let baseWhere: Prisma.TaskWhereInput;
    if (scope === TaskScopeDto.mine) {
      baseWhere = { assigned_to: userId };
    } else if (scope === TaskScopeDto.unassigned) {
      baseWhere = { assigned_to: null };
    } else if (scope === TaskScopeDto.all) {
      baseWhere = {};
    } else {
      // legacy fallback (sin scope explícito): admin ve todo, agente ve
      // mine + unassigned mezcladas. Igual que en `findAll`.
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

  /* ── Delete (admin only) ── */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.task.delete({ where: { id } });
    this.logger.log(`Task deleted: ${id}`);
    return { deleted: true };
  }
}

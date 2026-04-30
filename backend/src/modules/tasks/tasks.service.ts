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
  TicketActionDto,
} from './dto/task.dto';
import { Prisma } from '@prisma/client';
import { SupportService } from '../support/support.service';

/**
 * Sprint 8 Fase B.7 (2026-04-29) — ADR-073 expone tags asignados al cliente.
 * Se incluye `tag` anidado para evitar N+1 al renderizar chips en el tablero.
 */
const INCLUDE_TAG_ASSIGNMENTS = {
  tag_assignments: {
    include: {
      tag: { select: { id: true, slug: true, label: true, color: true } },
    },
  },
} as const;

const INCLUDE_RELATIONS = {
  assignee: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  creator: { select: { id: true, first_name: true, last_name: true } },
  client: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  ...INCLUDE_TAG_ASSIGNMENTS,
};

/**
 * Sprint 8 Fase B.2 (2026-04-29) — UI_SPEC §5.16 sidebar "Servicio" + bloque
 * adaptativo de servicio que muestra "servicio contratado, plan". Versión más
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
    // Sprint 8 Fase B.10 (2026-04-30) — ADR-074 bridge ticket↔task.
    // Inyectado para delegar en `SupportService.updateConversation`
    // cuando la tarea de cierre tiene `conversation_id` poblado.
    private support: SupportService,
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

  /* ── EC-T8-12 (Sprint 8 Fase B 2026-04-29) — `due_date` no puede estar
     en el pasado al crear/actualizar desde la API pública. El cron del
     Fase D que crea tareas retroactivas legítimas (mantenimientos del
     mes anterior cerrados a posteriori) debe invocar este service con
     `{ allowOverdue: true }`. Comparación a nivel de día (00:00 local)
     para que "hoy" siga siendo válido aunque sea por la tarde. */
  private assertDueDateNotInPast(
    dueDate: string | Date | null | undefined,
    opts: { allowOverdue?: boolean } = {},
  ): void {
    if (!dueDate || opts.allowOverdue) return;
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      throw new BadRequestException('due_date inválida');
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (due < todayStart) {
      throw new BadRequestException(
        'La fecha límite no puede estar en el pasado',
      );
    }
  }

  /* ── EC-T8-13 (Sprint 8 Fase B 2026-04-29) — `service_id` debe pertenecer
     al `client_id` declarado. Sin esta comprobación, un staff podría
     vincular una tarea al cliente A con el servicio del cliente B y la
     timeline + bloques adaptativos mostrarían datos cruzados. */
  private async assertServiceBelongsToClient(
    serviceId: string,
    clientId: string,
  ): Promise<void> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, user_id: true },
    });
    if (!service) {
      throw new BadRequestException('El servicio asociado no existe');
    }
    if (service.user_id !== clientId) {
      throw new BadRequestException(
        'El servicio no pertenece al cliente seleccionado',
      );
    }
  }

  /* ── Sprint 8 Fase B.7 (2026-04-29) — ADR-073. Verifica que TODOS los
     `tag_ids` recibidos existen en `task_tags`. Devuelve los IDs canónicos
     para usarlos en `createMany`/`deleteMany`. Lanza 400 si alguno no
     existe — fail-fast preferible a crear assignments parciales. */
  private async assertTagsExist(tagIds: string[]): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const unique = Array.from(new Set(tagIds));
    const found = await this.prisma.taskTag.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((t) => t.id));
      const missing = unique.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Estos tags no existen: ${missing.join(', ')}`,
      );
    }
    return unique;
  }

  /* ── Create ──
     Sprint 8 Fase B EC-T8-12/13/14/15/16 (2026-04-29): valida `due_date`
     no pasada, coherencia `service_id ↔ client_id`, y propaga los nuevos
     campos opcionales (`is_recurring`, `recurrence_day`, `billing_month`).
     `opts.allowOverdue` permite que el cron del Fase D cree tareas
     retroactivas legítimas (mantenimientos cerrados a posteriori) sin
     dispararse contra el guard EC-T8-12. */
  async create(
    dto: CreateTaskDto,
    creatorId: string,
    opts: { allowOverdue?: boolean } = {},
  ) {
    this.assertDueDateNotInPast(dto.due_date, opts);
    if (dto.service_id) {
      await this.assertServiceBelongsToClient(dto.service_id, dto.client_id);
    }
    if (dto.assigned_to) {
      await this.assertAssignableUser(dto.assigned_to);
    }
    // Sprint 8 Fase B.7 — ADR-073: validar tags antes de la transacción para
    // que un tag inexistente no deje la tarea creada sin etiquetar (fail-fast).
    const tagIds = dto.tag_ids ? await this.assertTagsExist(dto.tag_ids) : [];

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
        is_recurring: dto.is_recurring ?? false,
        recurrence_day: dto.recurrence_day,
        billing_month: dto.billing_month,
        reason: dto.reason,
        // Sprint 8 Fase B.10 — ADR-074. Sólo lo pobla el listener del bridge.
        conversation_id: dto.conversation_id,
        created_by: creatorId,
        ...(tagIds.length > 0 && {
          tag_assignments: {
            create: tagIds.map((tag_id) => ({ tag_id })),
          },
        }),
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
    // Sprint 8 Fase B.10 — ADR-074: filtro por ticket vinculado.
    if (query.conversation_id) {
      where.conversation_id = query.conversation_id;
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
     §5.16 sidebar Servicio + bloque adaptativo cuando hay service). La
     lista (`findAll`) sigue
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
    opts: { allowOverdue?: boolean } = {},
  ) {
    const existing = await this.findOne(id);
    // EC-T8-12 — si llega un `due_date` nuevo, no puede ser pasado.
    if (dto.due_date !== undefined) {
      this.assertDueDateNotInPast(dto.due_date, opts);
    }

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
    // Sprint 8 Fase B.7 — ADR-073: tags se setean por reemplazo completo
    // (semántica PUT, coherente con `set` de Prisma m2m). Si llega
    // `tag_ids` lo validamos antes; si llega vacío `[]` se desetiqueta.
    const newTagIds = dto.tag_ids
      ? await this.assertTagsExist(dto.tag_ids)
      : null;

    const task = await this.prisma.$transaction(async (tx) => {
      if (newTagIds !== null) {
        await tx.taskTagAssignment.deleteMany({ where: { task_id: id } });
        if (newTagIds.length > 0) {
          await tx.taskTagAssignment.createMany({
            data: newTagIds.map((tag_id) => ({ task_id: id, tag_id })),
          });
        }
      }
      return tx.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.assigned_to !== undefined && {
            assigned_to: dto.assigned_to,
          }),
          ...(dto.due_date !== undefined && {
            due_date: new Date(dto.due_date),
          }),
          ...(dto.client_note !== undefined && {
            client_note: dto.client_note,
          }),
          ...(dto.is_recurring !== undefined && {
            is_recurring: dto.is_recurring,
          }),
          ...(dto.recurrence_day !== undefined && {
            recurrence_day: dto.recurrence_day,
          }),
          ...(dto.billing_month !== undefined && {
            billing_month: dto.billing_month,
          }),
          ...(dto.reason !== undefined && {
            reason: dto.reason === '' ? null : dto.reason,
          }),
          ...(dto.status === TaskStatusDto.completed && {
            completed_at: new Date(),
          }),
        },
        include: INCLUDE_RELATIONS,
      });
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

  /* ── Complete with notes (maintenance flow + ticket-bridge) ──
     Sprint 8 Fase B.10 (2026-04-30) — ADR-074. Si `task.conversation_id`
     está poblado, el cierre delega en el módulo support: persiste la
     ClientNote(category=solution) vinculada a la conversación, marca el
     ticket como `resolved` o `closed` (según `ticket_action`), y emite
     `task.completed` con flag `__skipClientNotification` para que
     `TaskCompletedListener` ignore el evento — la notificación canónica
     al cliente la dispara `conversation.resolved`/`closed` desde support. */
  async complete(id: string, dto: CompleteTaskDto, userId: string) {
    const task = await this.findOne(id);
    if (['completed', 'cancelled'].includes(task.status)) {
      throw new BadRequestException('Esta tarea ya está cerrada');
    }

    // Bridge ticket→task: la tarea está vinculada a un ticket. El cierre
    // pasa por SupportService — única fuente de verdad para la
    // notificación al cliente. EC: si el agente olvida la nota o la
    // acción, fail-fast con mensaje accionable.
    if (task.conversation_id) {
      return this.completeAsTicketBridge(task, dto, userId);
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

  /* ── Sprint 8 Fase B.10 (2026-04-30) — ADR-074 ──
     Cierre de tareas tipo `support_ticket` (con `conversation_id`).
     Único punto donde el agente cierra el bucle de un ticket:
       1. Valida que llegue `ticket_action` (resolve|close) + `resolution_note`.
       2. Delega en `SupportService.updateConversation` con la nota — el
          módulo support persiste `ClientNote(solution)`, emite mensaje
          interno de sistema, dispara evento `conversation.resolved`/`closed`
          y notifica al cliente vía su listener canónico.
       3. Marca la tarea como completed.
       4. Emite `task.completed` con flag `__skipClientNotification` para
          que `TaskCompletedListener` (B.9) IGNORE el evento — sin notificar
          duplicado al cliente. El flag es interno (no parte del payload
          público); listeners agnósticos lo ven como propiedad extra y la
          ignoran si no la conocen. */
  private async completeAsTicketBridge(
    task: { id: string; type: string; conversation_id: string | null },
    dto: CompleteTaskDto,
    userId: string,
  ) {
    if (!task.conversation_id) {
      throw new BadRequestException(
        'Tarea sin ticket vinculado — usa el flujo simple de cierre.',
      );
    }
    if (!dto.ticket_action) {
      throw new BadRequestException(
        'Debes elegir si el ticket se resuelve o se cierra (ticket_action).',
      );
    }
    if (!dto.resolution_note?.trim()) {
      throw new BadRequestException(
        'La nota interna sobre la resolución del ticket es obligatoria.',
      );
    }

    const newStatus =
      dto.ticket_action === TicketActionDto.resolve ? 'resolved' : 'closed';

    // 1. Delegar al módulo support — persiste ClientNote(solution), emite
    //    `conversation.resolved`/`closed`, mensaje interno de sistema,
    //    notifica al cliente. La nota se asocia a `conversation_id`
    //    (no a `task_id`) — convención canónica del support.
    await this.support.updateConversation(
      task.conversation_id,
      { status: newStatus, resolution_note: dto.resolution_note },
      userId,
    );

    // 2. Marcar la tarea como completed.
    const completed = await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'completed', completed_at: new Date() },
      include: INCLUDE_RELATIONS,
    });

    // 3. Emitir `task.completed` con flag de skip — listener B.9 lo
    //    detecta y NO notifica al cliente. Mantenemos la emisión para
    //    auditoría y para futuros consumidores que quieran saber del
    //    cierre (ej. métricas de carga del agente).
    this.events.emit('task.completed', {
      task: completed,
      completedBy: userId,
      clientNotes: undefined,
      internalNotes: dto.resolution_note,
      __skipClientNotification: true,
    });

    this.logger.log(
      `Task ${task.id} (support_ticket) completed via bridge — ticket ${task.conversation_id} → ${newStatus}`,
    );
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

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

    // Role-based filtering: agents see only their tasks + unassigned
    if (!isAdmin) {
      where.OR = [{ assigned_to: userId }, { assigned_to: null }];
    }
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    if (query.assigned_to) where.assigned_to = query.assigned_to;
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

  /* ── Find one ── */
  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: INCLUDE_RELATIONS,
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return task;
  }

  /* ── Update ── */
  async update(
    id: string,
    dto: UpdateTaskDto,
    userId: string,
    isAdmin: boolean,
  ) {
    const existing = await this.findOne(id);
    // Agents can only update their own tasks
    if (!isAdmin && existing.assigned_to !== userId) {
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
    // Emit assignment event if agent changed
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
    // If it's a maintenance task, create the client note
    if (dto.internal_notes && task.client_id) {
      try {
        await this.prisma.clientNote.create({
          data: {
            user_id: task.client_id,
            author_id: userId,
            category: 'technical',
            body: dto.internal_notes,
            is_pinned: false,
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

  /* ── Stats ── */
  async getStats(userId: string, isAdmin: boolean) {
    const baseWhere: Prisma.TaskWhereInput = isAdmin
      ? {}
      : { OR: [{ assigned_to: userId }, { assigned_to: null }] };
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

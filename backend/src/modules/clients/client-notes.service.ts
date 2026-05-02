/* ═══════════════════════════════════════
   ClientNotesService — Sprint 16 Fase 16.B (ADR-079 §3.8 + §3.9)
   Gestión consolidada de `client_notes` con source tracking.
   Reemplaza `TaskNotesService` y la creación inline en
   `TasksService.complete` / `MaintenanceLogService.recordCompletion`.
   ═══════════════════════════════════════ */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, NoteCategory, NoteSourceSystem } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { ClientNoteQueryDto, CreateExceptionalNoteDto } from './dto/client.dto';

/**
 * Toda creación canónica de nota viene de uno de los 5 source_system:
 *
 *   - `ticket`           → al resolver/cerrar un ticket (módulo support).
 *   - `chat`             → mensaje interno en chat (futuro, no Sprint 16).
 *   - `maintenance_log`  → al completar un mantenimiento.
 *   - `task_completion`  → al completar una task no-bridge (cubre
 *                          provisioning_manual / client_lifecycle / project).
 *   - `exceptional`      → nota libre del agente desde el perfil cliente.
 *
 * Cada flujo tiene su entrypoint dedicado para que la firma sea explícita
 * y los listeners no compartan `createGeneric`. Cumple R7 (errores
 * tipados), R15 (servicio compacto, una responsabilidad).
 */
@Injectable()
export class ClientNotesService {
  private readonly logger = new Logger(ClientNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ── Crear nota desde cierre de ticket (módulo support) ──
     `triggered_by_action`: 'ticket.resolved' | 'ticket.closed'. */
  async createFromTicketCompletion(input: {
    user_id: string;
    author_id: string;
    conversation_id: string;
    body: string;
    triggered_by_action: 'ticket.resolved' | 'ticket.closed';
  }) {
    return this.prisma.clientNote.create({
      data: {
        user_id: input.user_id,
        author_id: input.author_id,
        category: NoteCategory.support,
        source_system: NoteSourceSystem.ticket,
        source_id: input.conversation_id,
        triggered_by_action: input.triggered_by_action,
        body: input.body,
        is_pinned: false,
      },
    });
  }

  /* ── Crear nota desde cierre de mantenimiento ──
     Llamado por `MaintenanceLogService.recordCompletion` cuando el agente
     deja nota interna. La nota pública (visible al cliente en el email)
     vive en `maintenance_logs.client_facing_notes`, no aquí. */
  async createFromMaintenanceCompletion(input: {
    user_id: string;
    author_id: string;
    slot_id: string;
    body: string;
  }) {
    return this.prisma.clientNote.create({
      data: {
        user_id: input.user_id,
        author_id: input.author_id,
        category: NoteCategory.maintenance,
        source_system: NoteSourceSystem.maintenance_log,
        source_id: input.slot_id,
        triggered_by_action: 'maintenance.completed',
        body: input.body,
        is_pinned: false,
      },
    });
  }

  /* ── Crear nota desde cierre de task no-bridge ──
     Cubre `provisioning_manual`, `client_lifecycle` y `project`.
     `category` se infiere del flujo (ADR-079 §3.9):
       - provisioning_manual → support
       - client_lifecycle    → onboarding
       - project             → project */
  async createFromTaskCompletion(input: {
    user_id: string;
    author_id: string;
    task_id: string;
    category: NoteCategory;
    body: string;
  }) {
    return this.prisma.clientNote.create({
      data: {
        user_id: input.user_id,
        author_id: input.author_id,
        category: input.category,
        source_system: NoteSourceSystem.task_completion,
        source_id: input.task_id,
        triggered_by_action: 'task.completed',
        body: input.body,
        is_pinned: false,
      },
    });
  }

  /* ── Crear nota excepcional (libre desde perfil cliente) ──
     `category='exceptional'`, `source_id=null`, `triggered_by_action='manual_entry'`. */
  async createExceptional(
    userId: string,
    authorId: string,
    dto: CreateExceptionalNoteDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Cliente no encontrado');
    if (!dto.body?.trim()) {
      throw new BadRequestException(
        'El cuerpo de la nota no puede estar vacío',
      );
    }

    return this.prisma.clientNote.create({
      data: {
        user_id: userId,
        author_id: authorId,
        category: NoteCategory.exceptional,
        source_system: NoteSourceSystem.exceptional,
        source_id: null,
        triggered_by_action: 'manual_entry',
        body: dto.body,
        is_pinned: dto.is_pinned ?? false,
      },
    });
  }

  /* ── Listar notas estructuradas del cliente ──
     Ordenadas por (is_pinned DESC, created_at DESC).
     Enriquecidas con nombre del autor (batch query — no N+1). */
  async findByClient(userId: string, query: ClientNoteQueryDto) {
    const {
      page = 1,
      limit = 50,
      category,
      source_system,
      pinned_only,
    } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.ClientNoteWhereInput = { user_id: userId };
    if (category) where.category = category;
    if (source_system) where.source_system = source_system;
    if (pinned_only) where.is_pinned = true;

    const [notes, total] = await Promise.all([
      this.prisma.clientNote.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ is_pinned: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.clientNote.count({ where }),
    ]);

    const authorIds = [...new Set(notes.map((n) => n.author_id))];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, first_name: true, last_name: true },
        })
      : [];
    const authorMap: Record<string, string> = {};
    authors.forEach((a) => {
      authorMap[a.id] = `${a.first_name} ${a.last_name}`;
    });

    const enriched = notes.map((n) => ({
      ...n,
      author_name: authorMap[n.author_id] ?? 'Desconocido',
    }));

    return paginate(enriched, total, page, limit);
  }

  /* ── Toggle pin ── */
  async togglePin(noteId: string) {
    const note = await this.prisma.clientNote.findUnique({
      where: { id: noteId },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    return this.prisma.clientNote.update({
      where: { id: noteId },
      data: { is_pinned: !note.is_pinned },
    });
  }

  /* ── Listar notas asociadas a una task (para timeline en card detalle) ──
     Solo notas con source_system='task_completion' + source_id=taskId. */
  async findByTask(taskId: string) {
    return this.prisma.clientNote.findMany({
      where: {
        source_system: NoteSourceSystem.task_completion,
        source_id: taskId,
      },
      orderBy: { created_at: 'desc' },
      include: {
        author: { select: { id: true, first_name: true, last_name: true } },
      },
    });
  }
}

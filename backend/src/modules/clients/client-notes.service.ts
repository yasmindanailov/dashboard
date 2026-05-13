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
 * Toda creación canónica de nota viene de uno de los 6 source_system:
 *
 *   - `ticket`           → al resolver/cerrar un ticket (módulo support).
 *   - `chat`             → mensaje interno en chat (futuro, no Sprint 16).
 *   - `maintenance_log`  → al completar un mantenimiento.
 *   - `task_completion`  → al completar una task no-bridge (cubre
 *                          provisioning_manual / client_lifecycle / project).
 *   - `exceptional`      → nota libre del agente desde el perfil cliente.
 *   - `service`          → Sprint 15C.II F.6 — al ejecutar una transición de
 *                          lifecycle de servicio (cancel/suspend/unsuspend,
 *                          tanto manual admin como automática del cron de
 *                          billing o del listener auto-reactivar al pagar).
 *                          Categoría siempre `lifecycle`.
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

  /* ── Crear nota desde transición de lifecycle de servicio (Sprint 15C.II F.6) ──
     Invocado direct-call por `ProvisioningService.suspendAsAdmin` /
     `unsuspendAsAdmin` / `deprovisionAsAdmin` desde dentro de la
     `$transaction` del orquestador (R3 §A.11.10.3.2): pasar `tx` para que la
     creación de la nota encaje en el mismo commit que la transición de
     `services.status`. `author_id: null` para actor sistema (cron de
     `autoSuspendServices`, listener auto-reactivar al pagar — convención
     heredable de F.5). `body` ya compuesto en el call site (incluye el
     `internal_note` del admin o el contexto del sistema con el nº de factura). */
  async createFromServiceLifecycleAction(
    input: {
      user_id: string;
      author_id: string | null;
      service_id: string;
      triggered_by_action:
        | 'service.cancelled'
        | 'service.suspended'
        | 'service.unsuspended'
        | 'service.auto_suspended_overdue'
        | 'service.auto_unsuspended_overdue';
      body: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.clientNote.create({
      data: {
        user_id: input.user_id,
        author_id: input.author_id,
        category: NoteCategory.lifecycle,
        source_system: NoteSourceSystem.service,
        source_id: input.service_id,
        triggered_by_action: input.triggered_by_action,
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

    // Sprint 15C.II F.6: `author_id` es nullable (actor sistema). Filtramos
    // los null antes del findMany y la UI los renderiza como 'Sistema'.
    const authorIds = [
      ...new Set(
        notes.map((n) => n.author_id).filter((id): id is string => id !== null),
      ),
    ];
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
      author_name:
        n.author_id === null
          ? 'Sistema'
          : (authorMap[n.author_id] ?? 'Desconocido'),
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

  /* ── Listar notas asociadas a un servicio (Sprint 15C.II F.6) ──
     Filtra por `source_system='service' AND source_id=serviceId`. La vista
     `/admin/services/[id]` la usa para mostrar el historial operativo
     (cancel/suspend/unsuspend, manual o auto) inline en la card "Notas
     operativas del servicio". El listing global de notas del cliente
     (`/admin/clients/[id]` → "Notas") usa `findByClient` y enriquece con
     el `triggered_by_action` + link al servicio. */
  async findByService(serviceId: string, options?: { limit?: number }) {
    const limit = options?.limit;
    const notes = await this.prisma.clientNote.findMany({
      where: {
        source_system: NoteSourceSystem.service,
        source_id: serviceId,
      },
      orderBy: [{ is_pinned: 'desc' }, { created_at: 'desc' }],
      ...(limit ? { take: limit } : {}),
    });

    // Enriquece con `author_name` igual que `findByClient` (consistente con
    // la API de listings) — author_id null se renderiza como 'Sistema'.
    const authorIds = [
      ...new Set(
        notes.map((n) => n.author_id).filter((id): id is string => id !== null),
      ),
    ];
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

    return notes.map((n) => ({
      ...n,
      author_name:
        n.author_id === null
          ? 'Sistema'
          : (authorMap[n.author_id] ?? 'Desconocido'),
    }));
  }
}

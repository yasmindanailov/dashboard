/* ═══════════════════════════════════════
   TaskNotesService — Sprint 8 Fase B.9 (2026-04-30)
   Notas internas inline asociadas a una tarea.
   ═══════════════════════════════════════ */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTaskNoteDto } from './dto/task-note.dto';

/**
 * Sprint 8 Fase B.9 (2026-04-30).
 *
 * Notas internas que el agente añade DURANTE la ejecución de la tarea
 * (no al cierre). Se persisten en `ClientNote` con `category=technical`
 * + `task_id` poblado, vinculadas al `client_id` de la tarea.
 * Coexisten con las notas `category=solution` que `tasks.service.complete()`
 * crea al cerrar la tarea con notas — esa convención (ADR-038) sigue
 * intacta. La diferencia semántica:
 *
 *   - `technical` (este service): apuntes operativos del agente mientras
 *     trabaja la tarea ("revisé el panel, todo OK", "esperando respuesta
 *     del cliente"). Múltiples por tarea.
 *   - `solution` (TasksService.complete): nota única que resume cómo
 *     se cerró la tarea. Aparece en la timeline del cliente como
 *     "Solución".
 *
 * Ambas se filtran por `task_id` para mostrarlas agrupadas en el
 * `ClientNotesTab` con el label "Tarea origen".
 */
@Injectable()
export class TaskNotesService {
  private readonly logger = new Logger(TaskNotesService.name);

  constructor(private prisma: PrismaService) {}

  async list(taskId: string) {
    return this.prisma.clientNote.findMany({
      where: { task_id: taskId, category: 'technical' },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        body: true,
        created_at: true,
        author: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
  }

  async create(taskId: string, dto: CreateTaskNoteDto, authorId: string) {
    // Verifica que la tarea existe y obtiene client_id (FK requerida en
    // ClientNote.user_id). Lanza 404 si no existe.
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, client_id: true },
    });
    if (!task) {
      throw new NotFoundException('Tarea no encontrada');
    }
    const note = await this.prisma.clientNote.create({
      data: {
        user_id: task.client_id,
        author_id: authorId,
        task_id: task.id,
        category: 'technical',
        body: dto.body,
        is_pinned: false,
      },
      select: {
        id: true,
        body: true,
        created_at: true,
        author: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
    this.logger.log(
      `TaskNote created: task=${taskId} author=${authorId} (technical)`,
    );
    return note;
  }
}

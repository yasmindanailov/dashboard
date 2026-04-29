/* ═══════════════════════════════════════
   TaskTagsService — Sprint 8 Fase B.7 (ADR-073)
   ═══════════════════════════════════════ */

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTaskTagDto, TASK_TAG_SLUG_REGEX } from './dto/task-tag.dto';

/**
 * CRUD mínimo de catálogo de tags (ADR-073). UI dinámica completa
 * (rename + color picker + fusión de duplicados) queda para Sprint 12
 * Settings; aquí sólo lo imprescindible para que el `NewTaskModal` y
 * el `TasksOverdueProcessor` (Fase C) puedan listar / crear / borrar.
 */
@Injectable()
export class TaskTagsService {
  private readonly logger = new Logger(TaskTagsService.name);

  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.taskTag.findMany({
      orderBy: { label: 'asc' },
      select: {
        id: true,
        slug: true,
        label: true,
        color: true,
        created_at: true,
      },
    });
  }

  async create(dto: CreateTaskTagDto, creatorId: string) {
    const slug = dto.slug ?? slugify(dto.label);
    if (!TASK_TAG_SLUG_REGEX.test(slug)) {
      throw new BadRequestException(
        `Slug derivado no es válido (${slug}). Pasa un slug explícito kebab-case.`,
      );
    }
    try {
      const tag = await this.prisma.taskTag.create({
        data: {
          slug,
          label: dto.label,
          color: dto.color,
          created_by: creatorId,
        },
      });
      this.logger.log(`TaskTag created: ${tag.slug} by ${creatorId}`);
      return tag;
    } catch (err) {
      // Prisma P2002 = unique constraint. Sugerimos el slug existente para
      // que el frontend pueda invitar al admin a reutilizarlo.
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe un tag con slug "${slug}". Reutilízalo o cambia el label.`,
        );
      }
      throw err;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.taskTag.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tag no encontrado');
    }
    // FK ON DELETE CASCADE elimina assignments asociadas — el agente que
    // tenía la tarea con ese tag verá la lista de chips reducida en
    // siguiente refresh. Si en el futuro quieres confirmación previa,
    // exponer count de assignments antes en la UI.
    await this.prisma.taskTag.delete({ where: { id } });
    this.logger.log(`TaskTag deleted: ${id} (${existing.slug})`);
    return { deleted: true };
  }
}

/**
 * Convertir un label arbitrario a slug kebab-case canónico. NO es
 * cripto-fuerte ni reversible; es una heurística para que el admin no
 * tenga que pensar el slug si no quiere. Mantenido inline (no helper
 * compartido) porque es el único punto del backend que lo necesita.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // descompone acentos
    .replace(/[̀-ͯ]/g, '') // borra los diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

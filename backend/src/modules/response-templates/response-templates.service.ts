import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  CreateResponseTemplateDto,
  UpdateResponseTemplateDto,
} from './dto/response-template.dto';

/* ═══════════════════════════════════════
   ResponseTemplatesService — Respuestas guardadas (macros de soporte).
   Rediseño UI F3·E12.

   Biblioteca de EQUIPO (decisión Yasmin 2026-06-29): un único set compartido
   por el staff de soporte. Cualquier agente de soporte lo lee, crea, edita y
   borra (CRUD colaborativo) — NO hay ownership por agente; `created_by` es
   solo trazabilidad. La autorización (staff de soporte) la imponen
   `AdminOnlyGuard` + CASL `Manage.ResponseTemplate` en el controller.

   Recurso CRUD hoja: sin eventos cross-módulo (R1/R8 no aplican).
   Ref: docs/20-modules/support/contract.md §Respuestas guardadas.
   ═══════════════════════════════════════ */

const CREATOR_SELECT = {
  creator: { select: { first_name: true, last_name: true } },
} satisfies Prisma.ResponseTemplateInclude;

type ResponseTemplateRow = Prisma.ResponseTemplateGetPayload<{
  include: typeof CREATOR_SELECT;
}>;

export interface ResponseTemplateDto {
  id: string;
  title: string;
  body: string;
  category: string | null;
  created_by: string | null;
  creator_name: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ResponseTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: {
    category?: string;
    search?: string;
  }): Promise<ResponseTemplateDto[]> {
    const where: Prisma.ResponseTemplateWhereInput = {};
    if (filter.category) where.category = filter.category;
    if (filter.search) {
      const search = filter.search.trim();
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const rows = await this.prisma.responseTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      include: CREATOR_SELECT,
    });
    return rows.map(toDto);
  }

  async create(
    dto: CreateResponseTemplateDto,
    actorId: string,
  ): Promise<ResponseTemplateDto> {
    const title = requireNonEmpty(dto.title, 'título');
    const body = requireNonEmpty(dto.body, 'cuerpo');
    const category = normalizeCategory(dto.category);

    const row = await this.prisma.responseTemplate.create({
      data: { title, body, category, created_by: actorId },
      include: CREATOR_SELECT,
    });
    return toDto(row);
  }

  async update(
    id: string,
    dto: UpdateResponseTemplateDto,
  ): Promise<ResponseTemplateDto> {
    await this.ensureExists(id);

    const data: Prisma.ResponseTemplateUpdateInput = {};
    if (dto.title !== undefined)
      data.title = requireNonEmpty(dto.title, 'título');
    if (dto.body !== undefined) data.body = requireNonEmpty(dto.body, 'cuerpo');
    if (dto.category !== undefined)
      data.category = normalizeCategory(dto.category);

    const row = await this.prisma.responseTemplate.update({
      where: { id },
      data,
      include: CREATOR_SELECT,
    });
    return toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.ensureExists(id);
    await this.prisma.responseTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const row = await this.prisma.responseTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(`Respuesta guardada ${id} no encontrada.`);
    }
  }
}

/* ─── Helpers puros ─── */

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`El ${field} no puede estar vacío.`);
  }
  return trimmed;
}

function normalizeCategory(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDto(row: ResponseTemplateRow): ResponseTemplateDto {
  const creatorName = row.creator
    ? `${row.creator.first_name} ${row.creator.last_name}`.trim()
    : null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    created_by: row.created_by,
    creator_name: creatorName || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

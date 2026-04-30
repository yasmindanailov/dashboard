/* ═══════════════════════════════════════
   TaskTag DTOs — Sprint 8 Fase B.7 (ADR-073)
   ═══════════════════════════════════════ */

import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sprint 8 Fase B.7 (2026-04-29) — ADR-073.
 *
 * Slug canónico kebab-case: minúsculas + dígitos + guiones. Sirve como
 * identificador estable para listeners/automatizaciones (ej. el listener
 * `ContactClientTaskListener` del Sprint 11 asignará el tag con
 * `slug='bienvenida'` a las tareas que cree). Si no se pasa, el service
 * lo genera del label (`slugify(label)`).
 */
export const TASK_TAG_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateTaskTagDto {
  @ApiProperty({ description: 'Etiqueta visible (ej: "Bienvenida")' })
  @IsString()
  @MaxLength(50)
  label!: string;

  @ApiPropertyOptional({
    description:
      'Slug canónico kebab-case <=50 chars. Si se omite, se calcula del label.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(TASK_TAG_SLUG_REGEX, {
    message: 'slug debe ser kebab-case (minúsculas + guiones)',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Color hex `#RRGGBB` opcional para el chip.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color debe ser #RRGGBB' })
  color?: string;
}

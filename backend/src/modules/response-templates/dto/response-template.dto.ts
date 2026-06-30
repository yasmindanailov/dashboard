import { IsOptional, IsString, MaxLength } from 'class-validator';

/* ═══════════════════════════════════════
   DTOs — Respuestas guardadas (macros de soporte). Rediseño UI F3·E12.

   Biblioteca de EQUIPO: el staff de soporte crea/edita un set compartido.
   La validación de "no vacío tras trim" + normalización vive en el service
   (centraliza la regla; el DTO acota tipos y longitudes máximas).
   ═══════════════════════════════════════ */

export class CreateResponseTemplateDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(10000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}

export class UpdateResponseTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}

export class ListResponseTemplatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

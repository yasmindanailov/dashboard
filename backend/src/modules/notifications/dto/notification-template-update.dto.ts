import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO para `PATCH /admin/notifications/templates/:id`.
 *
 * Los tres campos son opcionales — el endpoint hace partial update. Si
 * subject/body no compilan con Handlebars, el servicio devuelve 400 con
 * el mensaje de Handlebars (R14 + EC-S9-03).
 */
export class NotificationTemplateUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

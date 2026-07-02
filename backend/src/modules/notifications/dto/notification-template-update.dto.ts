import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO para `PATCH /admin/notifications/templates/:id`.
 *
 * Todos los campos son opcionales — el endpoint hace partial update. Si
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

  /**
   * F4·W3 — tono del layout maestro de email ('info'|'success'|'warning'|
   * 'danger'). Al fijarlo, `body` pasa a ser el FRAGMENTO del cuerpo y el render
   * lo envuelve en el layout. `null` = plantilla legacy (HTML completo).
   */
  @IsOptional()
  @IsIn(['info', 'success', 'warning', 'danger', null])
  semantic?: string | null;
}

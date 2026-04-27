import { IsObject, IsOptional } from 'class-validator';

/**
 * DTO para `POST /admin/notifications/templates/:id/preview`.
 *
 * Si no se aporta `payload`, el service usa la muestra canónica por
 * `event_type` (DEFAULT_PREVIEW_SAMPLES). Útil para previsualización
 * rápida sin que el admin tenga que rellenar variables.
 */
export class NotificationTemplatePreviewDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

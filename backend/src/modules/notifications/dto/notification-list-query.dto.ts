import { NotificationCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Query param DTO para `GET /notifications`.
 *
 * `unread_only=true` filtra solo las no leídas. Se usa cuando el cliente
 * quiere refrescar solo el estado pendiente sin paginar todo el histórico.
 *
 * `category` (F3·E10) filtra por categoría canónica server-side, correcto con
 * paginación (a diferencia de un filtro client-side sobre la página actual).
 */
export class NotificationListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread_only?: boolean;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;
}

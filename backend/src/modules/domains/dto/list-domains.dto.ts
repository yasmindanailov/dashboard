import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Sprint 15D Fase 15D.F.4 — query de "Mis dominios" (`GET /api/v1/domains`).
 *
 * Lista los `services` con `product.type='domain'` del usuario autenticado
 * (ownership server-side: el `userId` sale del JWT, nunca del query). Paginado.
 */
export class ListDomainsQueryDto {
  /** Filtra por `services.status` (active/pending/suspended/...). Opcional. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

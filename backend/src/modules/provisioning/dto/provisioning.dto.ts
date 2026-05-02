import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTOs Sprint 11 Fase 11.D — Provisioning REST endpoints.
 *
 * Cubren los 7 endpoints de la fase:
 *   Cliente: GET /services, GET /services/:id, POST /services/:id/sso,
 *            POST /services/:id/actions/:slug.
 *   Admin:   GET /admin/services, POST /admin/services/:id/reprovision,
 *            POST /admin/services/:id/deprovision.
 */

// ────────────────────────────────────────────────────────────────────────────
// Cliente
// ────────────────────────────────────────────────────────────────────────────

export class ServiceListQueryDto {
  /** Filtra por status real del service (active/pending/cancelled/etc.). */
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

export class ExecuteActionDto {
  /**
   * Payload del action. Cada plugin define el shape vía `payloadSchema`
   * en su `inlineActions[]`. El wrapper canónico
   * `executeActionWithCacheInvalidation` valida que el slug está declarado.
   * Plugins triviales `internal`/`manual` rechazan cualquier slug
   * (catálogo vacío).
   */
  @IsObject()
  payload: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Admin
// ────────────────────────────────────────────────────────────────────────────

export class AdminServiceListQueryDto {
  /** Filtro por user/cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  user_id?: string;

  /** Filtro por slug del provisioner (denormalizado en `services`). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provisioner_slug?: string;

  /** Filtro por status del service. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  /** Búsqueda libre en label/domain. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

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

export enum DeprovisionReasonDto {
  cancelled = 'cancelled',
  expired = 'expired',
  admin_override = 'admin_override',
}

export class DeprovisionDto {
  /** Motivo canónico de la cancelación administrativa. */
  @IsEnum(DeprovisionReasonDto)
  reason: DeprovisionReasonDto;

  /** Texto libre opcional para el audit log. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

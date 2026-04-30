import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RoleSlug, UserStatus } from '@prisma/client';

/**
 * Sub-conjunto de RoleSlug que se considera "agente asignable" en
 * `tasks.assigned_to`. Coherente con `assertAssignableUser` en
 * `tasks.service.ts` (Sprint 8 P0.1, 2026-04-26): un usuario es asignable
 * si su rol está en este set Y su status es `active`.
 */
export const ASSIGNABLE_ROLE_SLUGS = [
  RoleSlug.superadmin,
  RoleSlug.agent_full,
  RoleSlug.agent_billing,
  RoleSlug.agent_support,
] as const;

export type AssignableRoleSlug = (typeof ASSIGNABLE_ROLE_SLUGS)[number];

/**
 * Query DTO para `GET /api/v1/admin/users` (Sprint 8 Fase A — listado de
 * agentes asignables a tasks). Por defecto retorna todos los staff
 * (los 4 roles asignables). Filtros opcionales por rol y/o búsqueda.
 */
export class AgentListQueryDto {
  /**
   * Filtra por uno o más roles. Si se omite, retorna los 4 staff roles.
   * Acepta tanto `?role=agent_full` como `?role=agent_full&role=agent_billing`.
   */
  @ApiPropertyOptional({
    enum: ASSIGNABLE_ROLE_SLUGS,
    isArray: true,
    description:
      'Filtrar por rol(es). Sin filtro retorna los 4 staff roles asignables a tasks.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): string[] | undefined => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return [value];
    return undefined;
  })
  @IsArray()
  @IsEnum(RoleSlug, { each: true })
  role?: AssignableRoleSlug[];

  /**
   * Búsqueda case-insensitive en `first_name`, `last_name`, `email`.
   */
  @ApiPropertyOptional({ description: 'Search en nombre/apellido/email.' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Filtro por status. Default `active` (sólo agentes operativos).
   */
  @ApiPropertyOptional({
    enum: UserStatus,
    default: UserStatus.active,
    description: 'Status del usuario. Default `active`.',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

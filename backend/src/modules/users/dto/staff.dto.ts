import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { RoleSlug, UserStatus } from '@prisma/client';

/**
 * GL-21 (audit 2026-06-25 §6 Tier 3) — gestión de cuentas de staff/agentes.
 *
 * Roles staff GESTIONABLES desde el panel admin. Coincide con el set staff de
 * `AdminOnlyGuard` y con `ASSIGNABLE_ROLE_SLUGS` (agentes asignables a tasks).
 * NUNCA incluye `client`/`partner*`: este controller gestiona EXCLUSIVAMENTE
 * cuentas internas. AUTH-INV-4: los 7 roles del sistema son inmutables — aquí
 * solo se ASIGNA uno de los 4 roles staff, nunca se crea/edita/borra un rol.
 */
export const MANAGEABLE_STAFF_ROLES = [
  RoleSlug.superadmin,
  RoleSlug.agent_full,
  RoleSlug.agent_billing,
  RoleSlug.agent_support,
] as const;

export type ManageableStaffRole = (typeof MANAGEABLE_STAFF_ROLES)[number];

/**
 * Estados que el admin puede fijar en una cuenta staff (alta/baja operativa).
 * `inactive` = offboarding (el login ya bloquea `inactive` — jwt.strategy.ts).
 * `blocked` (lockout por intentos) y `pending_verification` los gestiona el
 * propio flujo de auth, no la gestión admin.
 */
export const SETTABLE_STAFF_STATUSES = [
  UserStatus.active,
  UserStatus.inactive,
] as const;

export type SettableStaffStatus = (typeof SETTABLE_STAFF_STATUSES)[number];

/** Crea una cuenta de staff. Solo `superadmin` (CASL `Manage.Agent`). */
export class CreateStaffDto {
  @ApiProperty({ example: 'nuevo.agente@aelium.net' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Nuevo' })
  @IsString()
  @MinLength(2)
  first_name: string;

  @ApiProperty({ example: 'Agente' })
  @IsString()
  @MinLength(2)
  last_name: string;

  @ApiProperty({ enum: MANAGEABLE_STAFF_ROLES })
  @IsIn([...MANAGEABLE_STAFF_ROLES])
  role: ManageableStaffRole;

  /**
   * Contraseña inicial (la fija el admin; el agente la cambia luego desde su
   * cuenta). Misma política que `RegisterDto` (AUTH-INV-2: hash bcrypt cost 12).
   */
  @ApiProperty({ example: 'TempPassword1' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, {
    message: 'La contraseña debe contener al menos una mayúscula',
  })
  @Matches(/[a-z]/, {
    message: 'La contraseña debe contener al menos una minúscula',
  })
  @Matches(/[0-9]/, {
    message: 'La contraseña debe contener al menos un número',
  })
  password: string;
}

/** Edita nombre y/o rol de una cuenta staff. Todos los campos opcionales. */
export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Nuevo' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Agente' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  last_name?: string;

  @ApiPropertyOptional({ enum: MANAGEABLE_STAFF_ROLES })
  @IsOptional()
  @IsIn([...MANAGEABLE_STAFF_ROLES])
  role?: ManageableStaffRole;
}

/** Activa/desactiva (offboarding) una cuenta staff. */
export class UpdateStaffStatusDto {
  @ApiProperty({ enum: SETTABLE_STAFF_STATUSES, example: UserStatus.inactive })
  @IsIn([...SETTABLE_STAFF_STATUSES])
  status: SettableStaffStatus;
}

/** Query del listado de gestión de staff (todos los estados por defecto). */
export class StaffListQueryDto {
  @ApiPropertyOptional({
    enum: MANAGEABLE_STAFF_ROLES,
    isArray: true,
    description: 'Filtrar por rol(es) staff. Sin filtro, todos los staff.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): string[] | undefined => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return [value];
    return undefined;
  })
  @IsArray()
  @IsIn([...MANAGEABLE_STAFF_ROLES], { each: true })
  role?: ManageableStaffRole[];

  @ApiPropertyOptional({ description: 'Search en nombre/apellido/email.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Filtro por estado. Sin filtro, todos los estados.',
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

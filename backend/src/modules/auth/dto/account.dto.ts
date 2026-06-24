import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

/* ═══════════════════════════════════════════════════════════════════════════
   DTOs de la cuenta self-service (ADR-085). Self-scoped por el userId del JWT;
   el controlador NUNCA acepta un userId por parámetro.
   ═══════════════════════════════════════════════════════════════════════════ */

/** PATCH /account/profile — datos de identidad propios (NO toca el registrar). */
export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  first_name?: string;

  @ApiPropertyOptional({ example: 'García' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  last_name?: string;

  @ApiPropertyOptional({
    example: 'es',
    description: 'Código de idioma (ISO-639).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;

  @ApiPropertyOptional({
    example: 'Europe/Madrid',
    description: 'Zona horaria IANA.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;
}

/** POST /account/change-password — misma política de fortaleza que el registro. */
export class ChangePasswordDto {
  @ApiProperty({ example: 'MiPasswordActual1' })
  @IsString()
  current_password: string;

  @ApiProperty({ example: 'MiPasswordNueva1' })
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
  new_password: string;
}

/** POST /account/2fa/{enable,disable} — confirma la contraseña (acción sensible). */
export class Confirm2faDto {
  @ApiProperty({ example: 'MiPasswordActual1' })
  @IsString()
  password: string;
}

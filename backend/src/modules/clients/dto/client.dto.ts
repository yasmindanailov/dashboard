import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import {
  ClientType,
  NoteCategory,
  NoteSourceSystem,
  UserStatus,
} from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/* ═══════════════════════════════════════
   Query DTO — list clients
   ═══════════════════════════════════════ */
export class ClientListQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/* ═══════════════════════════════════════
   Update Client Profile
   ═══════════════════════════════════════ */
export class UpdateClientProfileDto {
  @IsOptional()
  @IsEnum(ClientType)
  client_type?: ClientType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postal_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  billing_email?: string;

  @IsOptional()
  @IsString()
  notes_internal?: string;
}

/* ═══════════════════════════════════════
   Add Internal Note (legacy — kept for backward compat con
   `client_profiles.notes_internal` que sigue existiendo como
   campo histórico legacy en la tabla, ver clients.md §`client_profiles`)
   ═══════════════════════════════════════ */
export class AddNoteDto {
  @IsString()
  note!: string;
}

/* ═══════════════════════════════════════
   Sprint 16 (ADR-079 §3.8) — DTOs de notas estructuradas canónicas
   ═══════════════════════════════════════ */

/**
 * Nota excepcional — única forma de creación libre desde perfil cliente.
 * El resto de notas se crean automáticamente desde listeners (ticket/
 * maintenance/task) y NO exponen endpoint público.
 */
export class CreateExceptionalNoteDto {
  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;
}

export class ClientNoteQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(NoteCategory)
  category?: NoteCategory;

  @IsOptional()
  @IsEnum(NoteSourceSystem)
  source_system?: NoteSourceSystem;

  @IsOptional()
  @IsBoolean()
  pinned_only?: boolean;
}

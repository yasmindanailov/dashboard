import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ClientType, NoteCategory, UserStatus } from '@prisma/client';
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
   Add Internal Note (legacy — kept for backward compat)
   ═══════════════════════════════════════ */
export class AddNoteDto {
  @IsString()
  note!: string;
}

/* ═══════════════════════════════════════
   Structured Client Notes (7.H19)
   ═══════════════════════════════════════ */

export class CreateClientNoteDto {
  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsEnum(NoteCategory)
  category?: NoteCategory;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;
}

export class ClientNoteQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(NoteCategory)
  category?: NoteCategory;

  @IsOptional()
  @IsBoolean()
  pinned_only?: boolean;
}

import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt,
  IsNumber, IsUUID, IsArray, ValidateNested, IsDateString,
  Min, Max, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';

/* ═══════════════════════════════════════
   Invoice Item DTO
   ═══════════════════════════════════════ */

export class CreateInvoiceItemDto {
  @IsOptional()
  @IsUUID()
  service_id?: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_price: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  setup_fee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount_pct?: number;

  @IsOptional()
  @IsDateString()
  period_start?: string;

  @IsOptional()
  @IsDateString()
  period_end?: string;
}

/* ═══════════════════════════════════════
   Create Invoice DTO
   ═══════════════════════════════════════ */

export class CreateInvoiceDto {
  @IsUUID()
  user_id: string;

  @IsOptional()
  @IsUUID()
  billing_profile_id?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  tax_rate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsDateString()
  due_date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  is_manual?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}

/* ═══════════════════════════════════════
   Update Invoice DTO
   ═══════════════════════════════════════ */

export class UpdateInvoiceDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  payment_ref?: string;
}

/* ═══════════════════════════════════════
   Mark as Paid DTO
   ═══════════════════════════════════════ */

export class MarkAsPaidDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  payment_ref?: string;
}

/* ═══════════════════════════════════════
   Invoice List Query DTO
   ═══════════════════════════════════════ */

export class InvoiceListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  date_from?: string;

  @IsOptional()
  @IsString()
  date_to?: string;
}

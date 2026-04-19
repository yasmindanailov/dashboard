import { IsString, IsEnum, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { BillingProfileType } from '@prisma/client';

/* ═══════════════════════════════════════
   Create Billing Profile
   ═══════════════════════════════════════ */
export class CreateBillingProfileDto {
  @IsEnum(BillingProfileType)
  type!: BillingProfileType;

  @IsString()
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nif_cif?: string;

  @IsString()
  @MaxLength(255)
  address_line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_line2?: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsString()
  @MaxLength(20)
  postal_code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

/* ═══════════════════════════════════════
   Update Billing Profile
   ═══════════════════════════════════════ */
export class UpdateBillingProfileDto {
  @IsOptional()
  @IsEnum(BillingProfileType)
  type?: BillingProfileType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nif_cif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postal_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

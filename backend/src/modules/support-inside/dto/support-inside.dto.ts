import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/* ═══════════════════════════════════════
   Cliente — Sprint 8 Fase D
   ═══════════════════════════════════════ */

export class SubscribeSupportInsideDto {
  @IsUUID()
  product_pricing_id!: string;

  @IsOptional()
  @IsUUID()
  billing_profile_id?: string;
}

export class CancelSupportInsideDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export enum SupportInsideSlotTypeDto {
  maintenance = 'maintenance',
  maintenance_management = 'maintenance_management',
}

export class AddSlotDto {
  @IsUUID()
  service_id!: string;

  @IsEnum(SupportInsideSlotTypeDto)
  slot_type!: SupportInsideSlotTypeDto;

  @IsOptional()
  @IsBoolean()
  is_extra?: boolean;
}

/* ═══════════════════════════════════════
   Admin — Sprint 8 Fase D + ADR-075 §B.2
   Editor con 5 secciones card. Cada sección envía su subset.
   ═══════════════════════════════════════ */

export enum ProductStatusDto {
  active = 'active',
  inactive = 'inactive',
  deprecated = 'deprecated',
}

export enum SupportInsideChannelDto {
  webchat = 'webchat',
  email = 'email',
  phone = 'phone',
  whatsapp = 'whatsapp',
}

export enum SupportInsidePriorityTierDto {
  standard = 'standard',
  high = 'high',
  max = 'max',
}

export enum SupportInsideCtaVisibilityDto {
  hidden = 'hidden',
  catalog_banner = 'catalog_banner',
  landing_cta = 'landing_cta',
}

class PricingPatchDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  setup_fee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount_percentage?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class PricingByCycleDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PricingPatchDto)
  monthly?: PricingPatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PricingPatchDto)
  annual?: PricingPatchDto;
}

export class UpdateSupportInsidePlanDto {
  // Sección Identidad
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  short_description?: string | null;

  @IsOptional()
  @IsEnum(ProductStatusDto)
  status?: ProductStatusDto;

  // Sección Precios
  @IsOptional()
  @ValidateNested()
  @Type(() => PricingByCycleDto)
  pricing?: PricingByCycleDto;

  // Sección Slots y capacidades
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  slots_included?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(SupportInsideSlotTypeDto, { each: true })
  slot_types_allowed?: SupportInsideSlotTypeDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extra_slot_price?: number;

  // Sección Soporte y canales
  @IsOptional()
  @IsArray()
  @IsEnum(SupportInsideChannelDto, { each: true })
  channels_active?: SupportInsideChannelDto[];

  @IsOptional()
  @IsEnum(SupportInsidePriorityTierDto)
  priority_tier?: SupportInsidePriorityTierDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720) // 30 días
  response_sla_hours?: number;

  // Sección Configuración avanzada
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  partner_commission_pct?: number;

  @IsOptional()
  @IsEnum(SupportInsideCtaVisibilityDto)
  cta_visibility?: SupportInsideCtaVisibilityDto;
}

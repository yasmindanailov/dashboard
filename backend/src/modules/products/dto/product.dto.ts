import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt,
  Min, Max, IsDecimal, IsArray, ValidateNested, IsUUID,
  MaxLength, IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType, BillingCycle, ExtraType, ExtraApplicableCycle } from '@prisma/client';

/* ═══════════════════════════════════════
   Product Pricing DTO
   ═══════════════════════════════════════ */

export class ProductPricingDto {
  @IsEnum(BillingCycle)
  billing_cycle: BillingCycle;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

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
  discount_percentage?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/* ═══════════════════════════════════════
   Product Extra DTO
   ═══════════════════════════════════════ */

export class ProductExtraDto {
  @IsEnum(ExtraType)
  type: ExtraType;

  @IsBoolean()
  is_mandatory: boolean;

  @IsString()
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsUUID()
  extra_product_id?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  discount_percentage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  free_months?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  max_value_eur?: number;

  @IsOptional()
  @IsEnum(ExtraApplicableCycle)
  applicable_cycles?: ExtraApplicableCycle;

  @IsOptional()
  tld_restrictions?: any;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_uses?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/* ═══════════════════════════════════════
   Checklist Item DTO
   ═══════════════════════════════════════ */

export class ChecklistItemDto {
  @IsString()
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;
}

/* ═══════════════════════════════════════
   Create Product DTO
   ═══════════════════════════════════════ */

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  short_description?: string;

  @IsEnum(ProductType)
  type: ProductType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provisioner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  badge_text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @IsOptional()
  @IsBoolean()
  is_addon?: boolean;

  @IsOptional()
  @IsBoolean()
  is_global_addon?: boolean;

  @IsOptional()
  @IsBoolean()
  requires_existing_product?: boolean;

  @IsOptional()
  @IsString()
  required_product_type?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_quantity_per_client?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  suspension_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellation_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  data_retention_days?: number;

  @IsOptional()
  @IsBoolean()
  client_can_pause?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  pause_max_days?: number;

  @IsOptional()
  provisioner_config?: any;

  @IsOptional()
  audit_event_types?: any;

  @IsOptional()
  features?: any;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  partner_commission_pct?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPricingDto)
  pricing?: ProductPricingDto[];

  // Nested extras
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductExtraDto)
  extras?: ProductExtraDto[];

  // Nested checklist
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist_items?: ChecklistItemDto[];
}

/* ═══════════════════════════════════════
   Update Product DTO (all optional)
   ═══════════════════════════════════════ */

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  short_description?: string;

  // type is immutable — set at creation, never updated (EC-2)

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provisioner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  badge_text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  // is_addon, is_global_addon, requires_existing_product are immutable —
  // auto-set by type at creation (EC-4)

  @IsOptional()
  @IsString()
  required_product_type?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_quantity_per_client?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  suspension_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellation_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  data_retention_days?: number;

  @IsOptional()
  @IsBoolean()
  client_can_pause?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  pause_max_days?: number;

  @IsOptional()
  provisioner_config?: any;

  @IsOptional()
  audit_event_types?: any;

  @IsOptional()
  features?: any;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  partner_commission_pct?: number;
}

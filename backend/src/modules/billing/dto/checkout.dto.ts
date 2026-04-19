import {
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * CheckoutDto — Represents the client's purchase request.
 *
 * Flow:
 * 1. Client selects a product pricing plan
 * 2. Client selects (or creates) a billing profile
 * 3. Checkout creates a Service (pending) + Invoice (draft)
 * 4. Without payment plugin: admin marks invoice as paid → service activates
 * 5. With payment plugin: invoice is finalized → payment → auto-activate
 *
 * Ref: DECISIONS.md §12, §21
 */
export class CheckoutDto {
  @IsUUID()
  product_pricing_id: string;

  @IsOptional()
  @IsUUID()
  billing_profile_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  domain?: string;
}

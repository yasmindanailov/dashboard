import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * CheckoutItemsDto — carrito unificado (Sprint 15D Fase 15D.F.4, ADR-084 §2).
 *
 * `POST /api/v1/billing/checkout/items` — N ítems mixtos de producto y/o dominio
 * → N services + 1 factura. El precio se resuelve SIEMPRE server-side (R5); el
 * producto-dominio se resuelve por capability (R4), el cliente nunca envía su id.
 */
export class CartItemDto {
  @IsIn(['product', 'domain'])
  kind: 'product' | 'domain';

  /* ── kind: 'product' ── */
  /** Plan de precio elegido (`ProductPricing.id`). */
  @ValidateIf((o: CartItemDto) => o.kind === 'product')
  @IsUUID()
  product_pricing_id?: string;

  @ValidateIf((o: CartItemDto) => o.kind === 'product')
  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string;

  /** Dominio asociado al servicio de hosting (texto libre, opcional). */
  @ValidateIf((o: CartItemDto) => o.kind === 'product')
  @IsOptional()
  @IsString()
  @MaxLength(300)
  domain?: string;

  /* ── kind: 'domain' ── */
  /** FQDN a registrar (sld.tld). Se normaliza server-side. */
  @ValidateIf((o: CartItemDto) => o.kind === 'domain')
  @IsString()
  @MaxLength(255)
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    {
      message: 'domain_name inválido: debe ser un FQDN (p.ej. midominio.com).',
    },
  )
  domain_name?: string;

  /** Años de registro (1..10). */
  @ValidateIf((o: CartItemDto) => o.kind === 'domain')
  @IsInt()
  @Min(1)
  @Max(10)
  years?: number;

  /**
   * Operación del dominio (Sprint 15D.II.T2c.3). `register` (default) cobra en el
   * checkout; `transfer_in` crea el service `pending` pero se **excluye de la
   * factura** (cobro al completar, ADR-084 A2.3). El auth-code se aporta
   * post-checkout (`POST /domains/:id/transfer/submit-auth`), nunca en el carrito.
   */
  @ValidateIf((o: CartItemDto) => o.kind === 'domain')
  @IsOptional()
  @IsIn(['register', 'transfer_in'])
  operation?: 'register' | 'transfer_in';
}

export class CheckoutItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  /** Perfil de facturación (debe pertenecer al usuario — lo valida el checkout). */
  @IsOptional()
  @IsUUID()
  billing_profile_id?: string;
}

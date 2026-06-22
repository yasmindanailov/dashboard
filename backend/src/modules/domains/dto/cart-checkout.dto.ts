import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Sprint 15D Fase 15D.F.4 — checkout del carrito de dominios
 * (`POST /api/v1/domains/cart/checkout`).
 *
 * El cliente registra N dominios buscados (DOM-INV-2 advisory lock + DOM-INV-3
 * margin guard + DOM-INV-5 elegibilidad los aplica `BillingCheckoutService` al
 * resolver cada ítem — esta capa solo valida la forma). El precio se resuelve
 * SIEMPRE server-side desde `domain_tld_pricing` (R5); el `product_id` del
 * dominio lo resuelve el backend por capability (R4), nunca lo envía el cliente.
 */

/** Un dominio del carrito a registrar (v1: `register`, normalmente 1 año). */
export class CartDomainItemDto {
  /** FQDN completo (sld.tld). Se normaliza (trim+lowercase) server-side. */
  @IsString()
  @MaxLength(255)
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    {
      message: 'domain_name inválido: debe ser un FQDN (p.ej. midominio.com).',
    },
  )
  domain_name: string;

  /**
   * Años de registro (1..10). La UI v1 usa 1 (el pricing seedeado cubre 1 año);
   * el lookup en `domain_tld_pricing` es la fuente de verdad — si no hay precio
   * para (tld, años), el checkout falla con un mensaje accionable.
   */
  @IsInt()
  @Min(1)
  @Max(10)
  years: number;
}

export class CartCheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CartDomainItemDto)
  items: CartDomainItemDto[];

  /** Perfil de facturación (debe pertenecer al usuario — lo valida el checkout). */
  @IsOptional()
  @IsUUID()
  billing_profile_id?: string;
}

import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DomainPriceOperation } from '@prisma/client';

/**
 * Sprint 15D Fase 15D.G·1 — DTOs de la gestión admin de precios de dominios
 * (`domain_tld_pricing`). El admin ve la matriz (coste·markup·precio·fuente),
 * fuerza una sincronización (cron manual) y fija overrides manuales por TLD.
 */

/** Filtro opcional de la matriz de precios. */
export class ListDomainPricingQueryDto {
  @IsOptional()
  @IsString()
  registrar?: string;

  @IsOptional()
  @IsString()
  tld?: string;

  @IsOptional()
  @IsEnum(DomainPriceOperation)
  operation?: DomainPriceOperation;
}

/** Override manual del precio de venta de una fila (source→'manual'). */
export class SetManualPriceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
}

/** Motivo del borrado destructivo de un dominio (15D.G·2). */
export class DeleteDomainDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

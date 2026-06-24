import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Sprint 15D Fase 15D.F.2 — request del buscador de dominios
 * (`POST /api/v1/domains/check-availability`).
 *
 * El cliente envía el **SLD** (segunda etiqueta, sin punto) y, opcionalmente,
 * un subconjunto de TLDs a consultar. El precio se resuelve SIEMPRE server-side
 * desde `domain_tld_pricing` (R5, ADR-084 §1) — el frontend nunca calcula precio.
 */
export class CheckDomainAvailabilityDto {
  /** SLD sin punto (etiqueta DNS: 1-63 chars, alfanumérico + guiones internos). */
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/, {
    message:
      'sld inválido: debe ser una etiqueta DNS sin punto (a-z, 0-9, guiones internos).',
  })
  sld: string;

  /**
   * TLDs a consultar (sin punto). Si se omite, se consultan todos los TLDs
   * ofertables (los que tienen precio activo de registro). Cap defensivo a 15
   * para acotar el fan-out de llamadas al registrar.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  tlds?: string[];
}

/**
 * Buscador BULK (15D.II.S, ADR-081 A7.3) — `POST /domains/check-availability-bulk`.
 * Varios SLDs en una operación; el service deduplica + descarta inválidos + capa el
 * fan-out. El precio se resuelve server-side (R5).
 */
export class BulkCheckAvailabilityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(63, { each: true })
  slds: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  tlds?: string[];
}

/**
 * Buscador RICO (15D.II.S, ADR-081 A7.3) — `POST /domains/suggest`. Sugiere nombres
 * a partir de una palabra clave; el precio se resuelve server-side (R5).
 */
export class SuggestDomainsDto {
  /** Palabra clave (1-63 chars; letras/números/guiones). Se normaliza server-side. */
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/, {
    message:
      'keyword inválida: usa una etiqueta sin punto (a-z, 0-9, guiones internos).',
  })
  keyword: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  tlds?: string[];
}

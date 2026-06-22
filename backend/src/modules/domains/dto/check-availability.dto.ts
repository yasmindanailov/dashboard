import {
  ArrayMaxSize,
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

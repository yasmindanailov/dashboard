import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Sprint 15D Fase 15D.G·2 — datos de titular (WHOIS) que el cliente edita en su
 * perfil. Combinan `User` (nombre/email) + `ClientProfile` (empresa/contacto/
 * dirección). Al guardar se propagan al registrar (`contacts/modify`).
 *
 * Todos opcionales (PATCH parcial); la elegibilidad real (campos requeridos por
 * el registrar, `.es` NIF / `.eu` residencia) la aplica el plugin al propagar
 * (`REGISTRANT_INELIGIBLE`) — aquí no se bloquea el guardado del perfil.
 */
export class UpdateRegistrantDto {
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
  @MaxLength(300)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postal_code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}

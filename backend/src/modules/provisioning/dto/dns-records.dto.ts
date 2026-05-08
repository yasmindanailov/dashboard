import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Sprint 15C Fase 15C.D — DTOs de los endpoints DNS records.
 *
 * Materializa los inline actions canónicos del plugin DNS authority
 * (ADR-082 §6 + ADR-077 Amendment A1.3 + ADR-083 §5 decisión 17). El
 * payload se passa al wrapper `executeActionWithCacheInvalidation` que
 * lo valida contra `payloadSchema` Ajv del plugin antes de invocar al
 * mismo. Esta capa REST hace una primera validación class-validator
 * (rechaza basura grosera) sin sustituir al schema del plugin.
 *
 * Los 7 record kinds expuestos v1 son los del plugin Enhance:
 * `[A, AAAA, CNAME, MX, TXT, SRV, CAA]`. Plugins futuros con
 * `has_dns_management=true` deberán declarar el mismo shape v1 (ADR-077
 * Amendment A1.3 — slugs canónicos).
 */

const DNS_RECORD_KINDS_V1 = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'SRV',
  'CAA',
] as const;

export type DnsRecordKindV1 = (typeof DNS_RECORD_KINDS_V1)[number];

export class CreateDnsRecordDto {
  @IsIn(DNS_RECORD_KINDS_V1)
  kind: DnsRecordKindV1;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  value: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  ttl?: number;

  @IsOptional()
  @IsBoolean()
  proxy?: boolean;
}

export class UpdateDnsRecordDto {
  @IsOptional()
  @IsIn(DNS_RECORD_KINDS_V1)
  kind?: DnsRecordKindV1;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  value?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  ttl?: number;

  @IsOptional()
  @IsBoolean()
  proxy?: boolean;
}

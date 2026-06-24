import { Allow } from 'class-validator';

/**
 * DTO de `PATCH /admin/settings/:category/:key` — Sprint 12 (ADR-044).
 *
 * `value` es polimórfico (string | number | boolean | string[]): el shape
 * concreto depende del `type` de la entrada de catálogo, así que la validación
 * real vive en `coerceAndValidateSetting` (catálogo), no en class-validator.
 *
 * `@Allow()` whitelistea la propiedad para que el `ValidationPipe` global
 * (`whitelist: true` + `forbidNonWhitelisted: true`, main.ts) no la elimine ni
 * la rechace. NO se aplica `enableImplicitConversion` porque el tipo es
 * `unknown` — el valor llega intacto al service.
 */
export class UpdateSettingDto {
  @Allow()
  value!: unknown;
}

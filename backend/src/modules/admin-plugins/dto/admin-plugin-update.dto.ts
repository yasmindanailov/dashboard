import { IsBoolean, IsObject, IsOptional } from 'class-validator';

/**
 * DTO canónico para `PATCH /admin/plugins/:slug` — Sprint 15A Fase G (ADR-080).
 *
 * Doctrina:
 *   - Campos OPCIONALES — el admin puede tocar enabled, config o secrets
 *     individualmente sin reenviar todos.
 *   - `class-validator` valida shape de alto nivel (boolean / object).
 *   - Validación de contenido contra `manifest.configSchema` /
 *     `manifest.secretsSchema` se hace con Ajv en `AdminPluginsService.update`
 *     (no aquí — class-validator no entiende JSON-Schema).
 *   - `secrets` es un mapa plano `{ field_name: plaintext }`. El service
 *     lo cifra con `SecretVaultService.encryptRecord` antes de persistir.
 *     Si un campo declarado en `secretsSchema` se OMITE en el payload,
 *     se preserva su valor cifrado anterior (parcial-update).
 *
 * Sprint 15C Fase 15C.I — bug fix: removido `@ValidateNested() + @Type(() => Object)`
 * de `config`/`secrets`. La combinación con `forbidNonWhitelisted: true`
 * (main.ts ValidationPipe global) rechazaba props internas de `config`/`secrets`
 * con 400 Bad Request — el spec E2E Sprint 15A solo enviaba `enabled` así que
 * no se detectó. Validación profunda de campos vive en Ajv contra el manifest
 * (canónico R0) — class-validator solo necesita confirmar shape de alto nivel.
 */
export class AdminPluginUpdateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Campos NO secretos. Validados contra `manifest.configSchema` con Ajv. */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /**
   * Campos secretos en plaintext. El service los cifra antes de persistir.
   * NUNCA aparecen en respuestas GET — el admin que olvida una api key debe
   * reescribirla, no recuperarla. Mismo patrón que la mayoría de control panels
   * SaaS (Stripe Dashboard, Cloudflare API tokens, etc.).
   */
  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;
}

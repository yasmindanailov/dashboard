/**
 * Sprint 15C.II Fase D (2026-05-10) — audit sanitizer canónico.
 *
 * Materializa [ADR-083 Amendment A4.5](../../../../docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md#a45-sanitización-datapassword-en-wrapper-auditor-gap-g2--riesgo-compliance)
 * (gap G2 audit técnico 2026-05-10). R12 compliance: secrets nunca audit.
 *
 * Doctrina:
 *   - Todo `ActionResult.data.<field>` cuyo nombre matchea el regex canónico
 *     `/(password|secret|token|apiKey|privateKey|auth.?code)/i` se sustituye por
 *     `'[REDACTED]'` antes de persistir audit. (`auth.?code` cubre el EPP/auth
 *     code de registrar — `get_auth_code` 15D.F, ADR-081 Amendment A5.)
 *   - El admin sigue viendo el campo en la UI (toast/modal) durante la sesión
 *     inmediata; solo el log persistido lo enmascara.
 *   - Plugins pueden declarar `ServiceAction.allowsSensitiveDataInAudit?:
 *     readonly string[]` para excepciones legítimas (uncommon — requiere ADR
 *     específico justificando). NO aplica a `reset_account_password` ni
 *     equivalentes.
 *
 * Heredable a futuros plugins SaaS (15D RC, 15E Docker, 15G Plesk) que
 * retornen secretos one-time vía `ActionResult.data`.
 */

// `auth.?code` añadido en Sprint 15D.F (ADR-081 Amendment A5): el EPP/auth code
// de transferencia que retorna `get_auth_code` es un secreto → nunca a audit.
const SENSITIVE_KEY_REGEX =
  /(password|secret|token|apiKey|privateKey|auth.?code)/i;
const REDACTED_PLACEHOLDER = '[REDACTED]' as const;

/**
 * Redacta campos sensibles dentro de `data` (walk recursivo).
 *
 * - Keys que matchean el regex `password|secret|token|apiKey|privateKey|auth.?code`
 *   (case-insensitive) se sustituyen por `'[REDACTED]'`.
 * - `allowList` opcional permite skip per-key (uncommon).
 * - Idempotente: aplicar dos veces produce el mismo resultado (los valores
 *   `'[REDACTED]'` son strings primitivos y no se recursionan).
 * - Inputs `null` / `undefined` se devuelven sin tocar.
 *
 * Uso canónico (vive en `executeActionWithCacheInvalidation` antes del
 * `audit.logChange`). Plugins NUNCA llaman a esto directamente — el
 * sanitizer es responsabilidad del wrapper auditor.
 */
export function redactSensitiveFields<
  T extends Record<string, unknown> | undefined | null,
>(data: T, allowList: readonly string[] = []): T {
  if (data === null || data === undefined) {
    return data;
  }
  return walk(data, allowList) as T;
}

function walk(value: unknown, allowList: readonly string[]): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((v) => walk(v, allowList));
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key) && !allowList.includes(key)) {
      out[key] = REDACTED_PLACEHOLDER;
    } else {
      out[key] = walk(v, allowList);
    }
  }
  return out;
}

/**
 * Helper exportado para tests + callers que necesiten el regex canónico
 * (ej. validar que un nombre de campo nuevo en un plugin será redactado).
 *
 * Inmutable: la fuente única de verdad de qué campos son "sensibles" vive
 * en este archivo. Cualquier cambio (añadir / quitar términos) requiere
 * ADR específico.
 */
export const CANONICAL_SENSITIVE_KEY_REGEX = SENSITIVE_KEY_REGEX;

/**
 * Placeholder canónico exportado para tests + frontend (si necesitan
 * formatear la cadena en un tooltip "este campo se ocultó en el log").
 */
export const REDACTED_FIELD_PLACEHOLDER = REDACTED_PLACEHOLDER;

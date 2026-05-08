/**
 * Sprint 15C Fase 15C.B — mapping canónico HTTP → ProvisionerPluginError.
 *
 * Doctrina (R7 + ADR-077 §2.6 + ADR-083):
 *   - Todos los errores del cliente Enhance son `ProvisionerPluginError`
 *     con código semántico cerrado (NUNCA `Error` plano).
 *   - El orquestador `provisioning` usa `error.retriable` para decidir si
 *     reintentar (BullMQ backoff [30s,90s,270s]) o ir directo a DLQ +
 *     emitir `service.provisioning_failed`.
 *   - Mensajes incluyen contexto técnico (status, path, body resumido)
 *     PERO sanitizados — sin secretos del request (Authorization header
 *     NUNCA aparece en mensaje).
 *
 * Mapping HTTP status → ProvisionerErrorCode (ADR-083 §1 decisión 5):
 *   - 401, 403  → PROVIDER_AUTH_FAILED          (retriable=false → alerta admin)
 *   - 404       → INVALID_STATE                 (retriable=false → recurso no existe)
 *   - 408, 504  → PROVIDER_TIMEOUT              (retriable=true)
 *   - 409       → INVALID_STATE                 (retriable=false → conflict típico
 *                                                "ya existe", el plugin lo trata
 *                                                como idempotencia sintética)
 *   - 422       → INVALID_PAYLOAD               (retriable=false → bug del plugin
 *                                                o cambio breaking del spec)
 *   - 429       → PROVIDER_RATE_LIMITED         (retriable=true)
 *   - 5xx       → PROVIDER_INTERNAL_ERROR       (retriable=true por defecto)
 *   - timeout   → NETWORK_ERROR                 (retriable=true)
 *   - aborted   → NETWORK_ERROR                 (retriable=true)
 *   - 4xx otros → PROVIDER_INTERNAL_ERROR       (retriable=false defensive)
 */

import {
  ProvisionerErrorCode,
  ProvisionerPluginError,
} from '../../../../core/provisioning/types';

/**
 * Subset del JSON-error que orchd Enhance suele devolver:
 *   { code: "ConflictError", message: "...", details?: {...} }
 *
 * No es contractual del spec — Enhance lo emite "best effort". El cliente
 * lo extrae con `safeParseErrorBody` y lo embebe en el `cause` para diag.
 */
export interface EnhanceErrorBodyShape {
  readonly code?: string;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Construye un `ProvisionerPluginError` a partir de una respuesta HTTP
 * Enhance ya parseada. NO lanza — devuelve el error para que el call-site
 * lo lance con stack apropiado (mejor preservación de pila que rethrow).
 *
 * @param status        HTTP status code (200..599).
 * @param method        HTTP method (`GET`, `POST`, etc.) — para mensaje.
 * @param path          path relativo de la request (sin baseUrl).
 * @param body          body parseado (best-effort) o `undefined` si no JSON.
 */
export function mapHttpStatusToProvisionerError(
  status: number,
  method: string,
  path: string,
  body: EnhanceErrorBodyShape | undefined,
): ProvisionerPluginError {
  const { code, retriable } = resolveCodeAndRetriable(status);
  const enhanceCode = body?.code ? ` enhance_code="${body.code}"` : '';
  const enhanceMessage = body?.message ? ` message="${body.message}"` : '';
  const message =
    `Enhance API ${method} ${path} → HTTP ${status}` +
    `${enhanceCode}${enhanceMessage}`;
  return new ProvisionerPluginError(message, code, retriable, body);
}

/** Mapping HTTP status → (semantic code, retriable). */
function resolveCodeAndRetriable(status: number): {
  readonly code: ProvisionerErrorCode;
  readonly retriable: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: 'PROVIDER_AUTH_FAILED', retriable: false };
  }
  if (status === 404 || status === 409) {
    return { code: 'INVALID_STATE', retriable: false };
  }
  if (status === 408 || status === 504) {
    return { code: 'PROVIDER_TIMEOUT', retriable: true };
  }
  if (status === 422) {
    return { code: 'INVALID_PAYLOAD', retriable: false };
  }
  if (status === 429) {
    return { code: 'PROVIDER_RATE_LIMITED', retriable: true };
  }
  if (status >= 500 && status <= 599) {
    return { code: 'PROVIDER_INTERNAL_ERROR', retriable: true };
  }
  // Otros 4xx (400, 405, 410, 415, ...) — defensive: NO retriable (bug del
  // cliente o del spec; mejor que falle rápido y alerte que entrar en loop).
  return { code: 'PROVIDER_INTERNAL_ERROR', retriable: false };
}

/**
 * Construye un error de red (DNS/connection refused/abort/timeout transport-level).
 * Estos errores NO tienen status HTTP — el cliente nunca recibió una respuesta.
 */
export function networkError(
  method: string,
  path: string,
  cause: unknown,
): ProvisionerPluginError {
  const reason = stringifyCause(cause);
  return new ProvisionerPluginError(
    `Enhance API ${method} ${path} → network error: ${reason}`,
    'NETWORK_ERROR',
    true,
    cause,
  );
}

/** Construye un error de timeout AbortController (request agotada antes de respuesta). */
export function timeoutError(
  method: string,
  path: string,
  timeoutMs: number,
): ProvisionerPluginError {
  return new ProvisionerPluginError(
    `Enhance API ${method} ${path} → timeout after ${timeoutMs}ms`,
    'PROVIDER_TIMEOUT',
    true,
  );
}

/**
 * Construye un error cuando la respuesta llega pero NO se puede parsear como
 * el shape esperado. Indica drift del spec (Enhance v13+) o bug del plugin.
 */
export function invalidPayloadError(
  method: string,
  path: string,
  reason: string,
): ProvisionerPluginError {
  return new ProvisionerPluginError(
    `Enhance API ${method} ${path} → invalid response payload: ${reason}`,
    'INVALID_PAYLOAD',
    false,
  );
}

/**
 * Intenta parsear el body de una respuesta de error Enhance.
 * Devuelve `undefined` si no es JSON o no tiene la shape esperada.
 *
 * Nunca lanza — el call-site usa el resultado para el `cause` del error
 * lanzado al orquestador.
 */
export function safeParseErrorBody(
  raw: string,
): EnhanceErrorBodyShape | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const result: EnhanceErrorBodyShape = {};
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.code === 'string') {
      Object.assign(result, { code: obj.code });
    }
    if (typeof obj.message === 'string') {
      Object.assign(result, { message: obj.message });
    }
    if (typeof obj.details === 'object' && obj.details !== null) {
      Object.assign(result, { details: obj.details });
    }
    return result;
  } catch {
    return undefined;
  }
}

/** Sanitiza un error en string para logging. NUNCA imprime tokens/secretos. */
function stringifyCause(cause: unknown): string {
  if (cause instanceof Error) {
    // El name + message del DOMException de fetch (`TypeError`, `AbortError`,
    // `ETIMEDOUT`) son seguros — no llevan headers ni body de la request.
    return `${cause.name}: ${cause.message}`;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  return 'unknown';
}

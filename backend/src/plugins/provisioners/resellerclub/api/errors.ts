/**
 * Sprint 15D Fase 15D.C — mapping canónico de errores ResellerClub → ProvisionerPluginError.
 *
 * Doctrina (R7 + ADR-077 §2.6/A10 + ADR-081 §7):
 *   - Todo error del cliente RC es un `ProvisionerPluginError` con código
 *     semántico cerrado (NUNCA `Error` plano). El orquestador usa `retriable`
 *     para decidir reintento (BullMQ backoff) o DLQ + alerta (R13).
 *   - Los códigos de **dominio** (DOMAIN_UNAVAILABLE, REGISTRANT_INELIGIBLE,
 *     DOMAIN_IN_REDEMPTION, REGISTRAR_LOCKED, …) son `retriable=false` — el
 *     cliente/admin debe actuar; reintentar no cambia el resultado.
 *   - Mensajes con contexto técnico (command + status + detalle RC) PERO
 *     SANITIZADOS: NUNCA se incluye el querystring (lleva `auth-userid`+`api-key`).
 *
 * Particularidades RC verificadas (findings §3/§4.7, ADR-081 A1.3):
 *   - DOS envoltorios de error de negocio: `{status:'ERROR', message}` y
 *     `{status:'error', error}`, que llegan con HTTP 200 **o** 500.
 *   - El WAF de Cloudflare (delante de httpapi.com) devuelve 403 + HTML cuando
 *     la IP de salida no está whitelisteada → se mapea a PROVIDER_AUTH_FAILED.
 *   - RC no expone códigos-máquina en los shapes capturados: el mapeo de negocio
 *     es por **patrones sobre el texto** del mensaje. [REFINAR en el smoke Fase G
 *     con el catálogo real de errores — findings §4.8].
 */

import {
  ProvisionerErrorCode,
  ProvisionerPluginError,
} from '../../../../core/provisioning/types';
import { RcErrorEnvelope } from './types';

/** Origen lógico para `error_log.module` (GAP-15CII-N). */
export const RC_ERROR_MODULE = 'provisioning.resellerclub';

interface CodeRetriable {
  readonly code: ProvisionerErrorCode;
  readonly retriable: boolean;
}

/**
 * Detecta los DOS envoltorios de error de negocio de RC (findings §4.7).
 * Devuelve `undefined` si el payload no es un error de negocio (incluye el caso
 * de respuesta OK como un número plano de `signup`/`contacts/add`).
 */
export function parseRcErrorEnvelope(
  parsed: unknown,
): RcErrorEnvelope | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const o = parsed as Record<string, unknown>;
  const status = typeof o.status === 'string' ? o.status.toLowerCase() : '';
  if (status !== 'error') return undefined;
  const env: { status: 'ERROR' | 'error'; message?: string; error?: string } = {
    status: o.status === 'ERROR' ? 'ERROR' : 'error',
  };
  if (typeof o.message === 'string') env.message = o.message;
  if (typeof o.error === 'string') env.error = o.error;
  return env;
}

/** Detalle textual del envoltorio (`message` o `error`). */
export function rcErrorDetail(env: RcErrorEnvelope): string {
  return env.message ?? env.error ?? 'error desconocido';
}

/**
 * Detecta el challenge de Cloudflare (403/503 + HTML, findings §3): la IP de
 * salida no está whitelisteada en el panel RC. El WAF actúa ANTES de la app, así
 * que el cuerpo es HTML de Cloudflare, no un error JSON de la API.
 */
export function isCloudflareChallenge(
  status: number,
  contentType: string,
  body: string,
): boolean {
  if (status !== 403 && status !== 503) return false;
  if (!contentType.toLowerCase().includes('text/html')) return false;
  const b = body.toLowerCase();
  return (
    b.includes('cloudflare') ||
    b.includes('attention required') ||
    b.includes('cf-ray')
  );
}

/**
 * Heurística mensaje RC → ProvisionerErrorCode (ADR-081 §7). El orden importa
 * (lo más específico primero). [REFINAR Fase G con el catálogo real — §4.8].
 */
export function mapRcBusinessError(detail: string): CodeRetriable {
  const d = detail.toLowerCase();
  if (
    /not available|already registered|regthroughothers|currently registered|not available for registration/.test(
      d,
    )
  ) {
    return { code: 'DOMAIN_UNAVAILABLE', retriable: false };
  }
  if (/premium/.test(d)) {
    return { code: 'DOMAIN_PREMIUM', retriable: false };
  }
  if (/redemption|grace period|\brgp\b/.test(d)) {
    return { code: 'DOMAIN_IN_REDEMPTION', retriable: false };
  }
  if (/auth(?:orization)?[ -]?code|epp[ -]?code|invalid secret/.test(d)) {
    return { code: 'INVALID_AUTH_CODE', retriable: false };
  }
  if (/transfer/.test(d) && /reject|denied|nack|not allowed|failed/.test(d)) {
    return { code: 'TRANSFER_REJECTED', retriable: false };
  }
  if (/\block\b|theft protection|registrar lock|transferlock/.test(d)) {
    return { code: 'REGISTRAR_LOCKED', retriable: false };
  }
  if (
    /eligib|registrant|identification|\bnif\b|\bnie\b|residenc|requirement|tipo de identificacion/.test(
      d,
    )
  ) {
    return { code: 'REGISTRANT_INELIGIBLE', retriable: false };
  }
  if (
    /authentication|api[ -]?key|auth[ -]?userid|invalid credential|access denied|not authori[sz]ed|whitelist/.test(
      d,
    )
  ) {
    return { code: 'PROVIDER_AUTH_FAILED', retriable: false };
  }
  if (/rate limit|too many requests|throttl/.test(d)) {
    return { code: 'PROVIDER_RATE_LIMITED', retriable: true };
  }
  if (/try again|temporar|please retry|try later/.test(d)) {
    return { code: 'PROVIDER_INTERNAL_ERROR', retriable: true };
  }
  // Error de negocio RC no reconocido: definitivo (alerta + investigar), no
  // transitorio (evita loop). El smoke Fase G amplía los patrones.
  return { code: 'PROVIDER_INTERNAL_ERROR', retriable: false };
}

/** Construye el error a partir del envoltorio de negocio RC (HTTP 200 o 500). */
export function rcBusinessError(
  command: string,
  env: RcErrorEnvelope,
): ProvisionerPluginError {
  const detail = rcErrorDetail(env);
  const { code, retriable } = mapRcBusinessError(detail);
  return new ProvisionerPluginError(
    `ResellerClub ${command} → ${code} (rc: "${detail}")`,
    code,
    retriable,
    env,
    RC_ERROR_MODULE,
  );
}

/**
 * WAF de Cloudflare (IP de salida no whitelisteada) → PROVIDER_AUTH_FAILED +
 * alerta admin (findings §3). NO es un fallo de credenciales de la API: es config
 * de whitelist de IP en el panel RC (Settings → API).
 */
export function cloudflareWafError(command: string): ProvisionerPluginError {
  return new ProvisionerPluginError(
    `ResellerClub ${command} → bloqueado por el WAF de Cloudflare (403 HTML): la IP de salida no está whitelisteada en el panel RC (Settings → API). Ver findings §3.`,
    'PROVIDER_AUTH_FAILED',
    false,
    undefined,
    RC_ERROR_MODULE,
  );
}

/** Mapping de status HTTP (errores NO de negocio) → ProvisionerErrorCode. */
export function mapHttpStatusToProvisionerError(
  status: number,
  command: string,
  detail?: string,
): ProvisionerPluginError {
  const { code, retriable } = resolveHttpStatus(status);
  const tail = detail ? ` (rc: "${detail}")` : '';
  return new ProvisionerPluginError(
    `ResellerClub ${command} → HTTP ${status} → ${code}${tail}`,
    code,
    retriable,
    undefined,
    RC_ERROR_MODULE,
  );
}

function resolveHttpStatus(status: number): CodeRetriable {
  if (status === 401 || status === 403) {
    return { code: 'PROVIDER_AUTH_FAILED', retriable: false };
  }
  if (status === 408 || status === 504) {
    return { code: 'PROVIDER_TIMEOUT', retriable: true };
  }
  if (status === 429) {
    return { code: 'PROVIDER_RATE_LIMITED', retriable: true };
  }
  if (status >= 500 && status <= 599) {
    return { code: 'PROVIDER_INTERNAL_ERROR', retriable: true };
  }
  // Otros 4xx — defensive: NO retriable (mejor fallar rápido + alertar que loop).
  return { code: 'PROVIDER_INTERNAL_ERROR', retriable: false };
}

/** Error de red (DNS/connection refused/abort transport-level) — sin status HTTP. */
export function networkError(
  command: string,
  cause: unknown,
): ProvisionerPluginError {
  const reason =
    cause instanceof Error ? `${cause.name}: ${cause.message}` : 'desconocido';
  return new ProvisionerPluginError(
    `ResellerClub ${command} → error de red: ${reason}`,
    'NETWORK_ERROR',
    true,
    cause,
    RC_ERROR_MODULE,
  );
}

/** Timeout del AbortController (request agotada antes de respuesta). */
export function timeoutError(
  command: string,
  timeoutMs: number,
): ProvisionerPluginError {
  return new ProvisionerPluginError(
    `ResellerClub ${command} → timeout tras ${timeoutMs}ms`,
    'PROVIDER_TIMEOUT',
    true,
    undefined,
    RC_ERROR_MODULE,
  );
}

/** La respuesta llega pero no se puede interpretar (drift del shape o bug). */
export function invalidPayloadError(
  command: string,
  reason: string,
): ProvisionerPluginError {
  return new ProvisionerPluginError(
    `ResellerClub ${command} → payload inesperado: ${reason}`,
    'INVALID_PAYLOAD',
    false,
    undefined,
    RC_ERROR_MODULE,
  );
}

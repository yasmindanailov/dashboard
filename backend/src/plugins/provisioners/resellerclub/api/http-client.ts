/**
 * Sprint 15D Fase 15D.C — wrapper HTTP low-level del cliente ResellerClub (LogicBoxes API).
 *
 * Responsabilidades:
 *   - `fetch` nativo (Node.js) sin dependencias.
 *   - Transporte RC (findings §1, ADR-081 §2): URL `<base>/<command>.json`,
 *     auth `auth-userid` + `api-key` en **cada** request (querystring en GET,
 *     body `application/x-www-form-urlencoded` en POST), arrays como **claves
 *     duplicadas** (`ns=a&ns=b`, NO `ns[]`).
 *   - User-Agent realista (findings §3): el WAF de Cloudflare challenge-a a
 *     clientes "no navegador"; el UA por defecto imita Chrome (proven en OT&E).
 *   - Timeout por request vía `AbortController` (default 30s — register/renew RC
 *     son operaciones de registro reales, más lentas que un panel; la protección
 *     ante fallos repetidos la da el circuit breaker del wrapper, ADR-080 — NO se
 *     anida un 2º breaker aquí).
 *   - Mapeo errores → `ProvisionerPluginError` con código semántico (errors.ts):
 *     WAF Cloudflare, los DOS envoltorios de negocio RC (HTTP 200 **o** 500),
 *     status HTTP, red y timeout. NUNCA lanza `Error` plano.
 *
 * SEGURIDAD (R12): el querystring/body llevan `auth-userid` + `api-key`. Este
 * cliente **NUNCA** loguea la URL completa ni el body — solo el `command`, el
 * status y el detalle (texto) del error de RC.
 *
 * El cliente high-level (`client.ts`) lo compone para exponer métodos tipados
 * por endpoint (`checkAvailability`, `registerDomain`, …).
 */

import { Logger } from '@nestjs/common';

import {
  cloudflareWafError,
  invalidPayloadError,
  isCloudflareChallenge,
  mapHttpStatusToProvisionerError,
  networkError,
  parseRcErrorEnvelope,
  rcBusinessError,
  rcErrorDetail,
  timeoutError,
} from './errors';

/** URLs base RC (findings §1 / ADR-081 §11). Sin trailing slash. */
export const RESELLERCLUB_SANDBOX_URL = 'https://test.httpapi.com/api';
export const RESELLERCLUB_PRODUCTION_URL = 'https://httpapi.com/api';

export type RcEnvironment = 'sandbox' | 'production';

/** Resuelve la URL base según el `environment` del manifest (ADR-081 §2). */
export function resolveResellerClubBaseUrl(environment: RcEnvironment): string {
  return environment === 'production'
    ? RESELLERCLUB_PRODUCTION_URL
    : RESELLERCLUB_SANDBOX_URL;
}

/** UA por defecto: imita un navegador para no disparar el challenge de Cloudflare (findings §3). */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ResellerClubHttpClientConfig {
  /** URL base RC (`resolveResellerClubBaseUrl(environment)`). Sin trailing slash. */
  readonly baseUrl: string;
  /** Reseller Id (`auth-userid`). Desde el vault del manifest (ADR-080), nunca en logs (R12). */
  readonly authUserId: string;
  /** API key (`api-key`). Desde el vault del manifest (ADR-080), nunca en logs (R12). */
  readonly apiKey: string;
  /** Timeout por request en ms. Default 30000. */
  readonly timeoutMs?: number;
  /** User-Agent. Default: imita Chrome (findings §3). */
  readonly userAgent?: string;
}

/** Valores admitidos como parámetro RC (los arrays se serializan como claves duplicadas). */
export type RcParamValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | undefined;

export type RcParams = Record<string, RcParamValue>;
export type RcHttpMethod = 'GET' | 'POST';

export class ResellerClubHttpClient {
  private readonly logger = new Logger(ResellerClubHttpClient.name);
  private readonly baseUrl: string;
  private readonly authUserId: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(config: ResellerClubHttpClientConfig) {
    if (!config.baseUrl) {
      throw new Error('ResellerClubHttpClient: baseUrl is required');
    }
    if (!config.authUserId) {
      throw new Error('ResellerClubHttpClient: authUserId is required');
    }
    if (!config.apiKey) {
      throw new Error('ResellerClubHttpClient: apiKey is required');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.authUserId = config.authUserId;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
  }

  /**
   * Ejecuta un comando RC (`<base>/<command>.json`). Devuelve el JSON
   * deserializado a `unknown` — el call-site (client.ts) lo valida/narrow.
   * Lanza `ProvisionerPluginError` con código semántico en cualquier fallo.
   */
  async call<T = unknown>(
    command: string,
    params: RcParams = {},
    method: RcHttpMethod = 'GET',
  ): Promise<T> {
    const url = `${this.baseUrl}/${command}.json`;
    const query = this.serialize(params); // incluye auth — NUNCA loguear
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response =
        method === 'GET'
          ? await fetch(`${url}?${query}`, {
              method: 'GET',
              headers: this.buildHeaders(false),
              signal: controller.signal,
            })
          : await fetch(url, {
              method: 'POST',
              headers: this.buildHeaders(true),
              body: query,
              signal: controller.signal,
            });
    } catch (cause) {
      clearTimeout(timeoutHandle);
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw timeoutError(command, this.timeoutMs);
      }
      throw networkError(command, cause);
    }
    clearTimeout(timeoutHandle);

    return this.handleResponse<T>(command, response);
  }

  /** GET — params en querystring. */
  async get<T = unknown>(command: string, params?: RcParams): Promise<T> {
    return this.call<T>(command, params, 'GET');
  }

  /** POST — params en body form-urlencoded. */
  async post<T = unknown>(command: string, params?: RcParams): Promise<T> {
    return this.call<T>(command, params, 'POST');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Serializa params + auth como `x-www-form-urlencoded` con claves duplicadas para arrays. */
  private serialize(params: RcParams): string {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value as readonly (string | number)[]) {
          usp.append(key, String(item)); // ns=a&ns=b (claves duplicadas, findings §1)
        }
      } else if (value !== undefined) {
        usp.append(key, String(value as string | number | boolean));
      }
    }
    // Auth en cada request (ADR-081 §2). Va en query (GET) o body (POST).
    usp.append('auth-userid', this.authUserId);
    usp.append('api-key', this.apiKey);
    return usp.toString();
  }

  private buildHeaders(isPost: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': this.userAgent,
    };
    if (isPost) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    return headers;
  }

  private async handleResponse<T>(
    command: string,
    response: Response,
  ): Promise<T> {
    const status = response.status;
    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await this.readBody(response);

    // 1. WAF de Cloudflare (403/503 + HTML): IP de salida no whitelisteada (§3).
    if (isCloudflareChallenge(status, contentType, rawBody)) {
      this.logger.warn(`RC ${command} → Cloudflare WAF (HTTP ${status})`);
      throw cloudflareWafError(command);
    }

    // 2. Parse JSON (RC siempre responde JSON; un id escalar `33566240` es JSON válido).
    let parsed: unknown = null;
    if (rawBody.length > 0) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        if (!response.ok) {
          throw mapHttpStatusToProvisionerError(status, command);
        }
        throw invalidPayloadError(command, 'respuesta no-JSON inesperada');
      }
    }

    // 3. Envoltorio de error de negocio RC (llega con HTTP 200 **o** 500) — antes del status.
    const env = parseRcErrorEnvelope(parsed);
    if (env) {
      this.logger.warn(
        `RC ${command} → error de negocio: "${rcErrorDetail(env)}"`,
      );
      throw rcBusinessError(command, env);
    }

    // 4. Error HTTP sin envoltorio de negocio.
    if (!response.ok) {
      throw mapHttpStatusToProvisionerError(status, command);
    }

    // 5. Éxito.
    return parsed as T;
  }

  private async readBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}

/**
 * Sprint 15C Fase 15C.B — wrapper HTTP low-level del cliente Enhance.
 *
 * Responsabilidades:
 *   - `fetch` nativo (Node.js 24) sin dependencias adicionales.
 *   - Headers canónicos: `Authorization: Bearer <apiToken>` + `Accept: application/json`
 *     + `Content-Type: application/json` (en POST/PATCH/PUT) + User-Agent
 *     identificativo (ADR-083 §1 decisión 6).
 *   - Timeout configurable por request via `AbortController`. Default 15s
 *     (Sprint 15C.II Fase F.3 — GAP-15CII-G5, bajado de 30s): fail-fast en
 *     los workers BullMQ — la API de orchd responde en <5s típicamente; 15s
 *     cubre cualquier pico razonable sin retener un worker medio minuto si el
 *     proveedor se cuelga. La protección ante fallos *repetidos* la da el
 *     circuit breaker del wrapper (`getServiceInfoWithCache` /
 *     `executeActionWithCacheInvalidation`) — deliberadamente NO se anida un
 *     segundo breaker dentro de este HTTP client (anti-patrón "blanket
 *     protection"; envolver el client en su propio breaker queda diferido a
 *     v1.1 si una operación lo justificara — ADR-080 circuit breaker doctrine).
 *   - Mapeo errores HTTP / network / timeout → `ProvisionerPluginError`
 *     con código semántico (errors.ts). NUNCA lanza `Error` plano.
 *   - Logging estructurado (NestJS Logger) con masking automático del
 *     token (`Authorization: Bearer <REDACTED>`).
 *
 * NO responsabilidades:
 *   - Auth refresh / rotation — la `apiToken` es Super Admin estática
 *     persistida en `plugin_installs.secrets` (ADR-083 §1 decisión 3).
 *     Si filtración: admin la rota desde panel Enhance; el plugin se
 *     re-configura via PATCH /admin/plugins/enhance_cp.
 *   - Retry — vive en BullMQ (ADR-063 backoff [30s,90s,270s]) o en circuit
 *     breaker (ADR-080) según el call-site. El http-client falla rápido.
 *   - Rate limiting — el circuit breaker absorbe la presión cuando el
 *     proveedor cae; no replicamos rate limit local que duplicaría logic.
 *
 * Tipos: el cliente high-level (`client.ts`) usa generics para tipar la
 * respuesta JSON. Este wrapper la deserializa a `unknown` y deja la
 * validación al call-site (que conoce el shape esperado).
 */

import { Logger } from '@nestjs/common';

import {
  EnhanceErrorBodyShape,
  invalidPayloadError,
  mapHttpStatusToProvisionerError,
  networkError,
  safeParseErrorBody,
  timeoutError,
} from './errors';

/**
 * Configuración del cliente HTTP. Se construye una vez por instancia del
 * plugin; los call-sites reciben el cliente ya configurado.
 */
export interface EnhanceHttpClientConfig {
  /** Base URL Enhance (`https://<panel-host>`). Sin trailing slash. */
  readonly baseUrl: string;

  /**
   * Bearer token Super Admin. Cargado desde `plugin_installs.secrets.apiToken`
   * descifrado por `SecretVaultService` (ADR-080 §3 + ADR-083 §1 decisiones 2-3).
   * Se incluye en cada request.
   */
  readonly apiToken: string;

  /** Timeout por request en milisegundos. Default 15000 (15s) — GAP-15CII-G5. */
  readonly timeoutMs?: number;

  /**
   * User-Agent identificativo Aelium. Default
   * `Aelium-Dashboard/1.0 EnhanceProvisionerPlugin/1.0.0`.
   * Útil para que el admin Enhance reconozca tráfico Aelium en logs.
   */
  readonly userAgent?: string;
}

/** Opciones por-request opcionales. */
export interface EnhanceHttpRequestOptions {
  /** Query params (se serializan con URLSearchParams). */
  readonly query?: Record<string, string | number | boolean | undefined>;

  /** Body (será JSON-stringified si no es undefined). */
  readonly body?: unknown;

  /**
   * Si true, NO añade Authorization header (para `GET /version` que es
   * idempotente sin auth — ADR-083 §1 decisión 5).
   */
  readonly skipAuth?: boolean;

  /** Override del timeout default para esta request. */
  readonly timeoutMs?: number;
}

/** Métodos HTTP soportados por el cliente. */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Cliente HTTP low-level Enhance.
 *
 * El cliente high-level (`client.ts`) lo compone para exponer métodos
 * tipados por endpoint (`createCustomer`, `getDnsZone`, etc.).
 */
export class EnhanceHttpClient {
  private readonly logger = new Logger(EnhanceHttpClient.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(config: EnhanceHttpClientConfig) {
    if (!config.baseUrl) {
      throw new Error('EnhanceHttpClient: baseUrl is required');
    }
    if (!config.apiToken) {
      throw new Error('EnhanceHttpClient: apiToken is required');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.userAgent =
      config.userAgent ?? 'Aelium-Dashboard/1.0 EnhanceProvisionerPlugin/1.0.0';
  }

  /**
   * Ejecuta una request HTTP contra Enhance.
   *
   * Devuelve el body JSON deserializado a `unknown`. El call-site lo
   * valida con su shape esperado (TypeScript narrowing + runtime guard
   * cuando aplique).
   *
   * Lanza `ProvisionerPluginError` con código semántico en cualquier fallo
   * (HTTP error, network error, timeout, invalid JSON).
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: EnhanceHttpRequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const headers = this.buildHeaders(method, options);
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (options.body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (cause) {
      clearTimeout(timeoutHandle);
      // AbortController triggers an `AbortError` — distinguishable from
      // generic network failures.
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw timeoutError(method, path, timeoutMs);
      }
      throw networkError(method, path, cause);
    }
    clearTimeout(timeoutHandle);

    return this.handleResponse<T>(method, path, response);
  }

  // ─── Public convenience methods ─────────────────────────────────────────

  /** GET — sin body. */
  async get<T = unknown>(
    path: string,
    options?: Omit<EnhanceHttpRequestOptions, 'body'>,
  ): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  /** POST — body JSON. */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<EnhanceHttpRequestOptions, 'body'>,
  ): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  /** PATCH — body JSON. */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<EnhanceHttpRequestOptions, 'body'>,
  ): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  /** PUT — body JSON. */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<EnhanceHttpRequestOptions, 'body'>,
  ): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  /** DELETE — sin body. */
  async delete<T = unknown>(
    path: string,
    options?: Omit<EnhanceHttpRequestOptions, 'body'>,
  ): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private buildUrl(
    path: string,
    query: EnhanceHttpRequestOptions['query'],
  ): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${this.baseUrl}${normalizedPath}`;
    if (query !== undefined) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs.length > 0) {
        url += url.includes('?') ? `&${qs}` : `?${qs}`;
      }
    }
    return url;
  }

  private buildHeaders(
    method: HttpMethod,
    options: EnhanceHttpRequestOptions,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
    if (!options.skipAuth) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }
    if (options.body !== undefined && method !== 'GET' && method !== 'DELETE') {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  private async handleResponse<T>(
    method: HttpMethod,
    path: string,
    response: Response,
  ): Promise<T> {
    // Caso 204/205 No Content — devolvemos `null as T` (call-site sabe que
    // su firma `Promise<void>` lo recibe).
    if (response.status === 204 || response.status === 205) {
      return null as T;
    }

    const rawBody = await this.readBody(response);

    if (!response.ok) {
      const parsedError = safeParseErrorBody(rawBody);
      this.logger.warn(
        `Enhance API ${method} ${path} → HTTP ${response.status}` +
          (parsedError?.code ? ` enhance_code="${parsedError.code}"` : ''),
      );
      throw mapHttpStatusToProvisionerError(
        response.status,
        method,
        path,
        parsedError,
      );
    }

    return this.parseSuccessBody<T>(method, path, response, rawBody);
  }

  private async readBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  private parseSuccessBody<T>(
    method: HttpMethod,
    path: string,
    response: Response,
    rawBody: string,
  ): T {
    if (rawBody.length === 0) {
      return null as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    // El endpoint /orgs/{org}/members/{m}/sso devuelve text/plain con la
    // OTP URL (no JSON). El endpoint /version devuelve string SemVer
    // formateado con quotes ("1.0.0-alpha.35"). Ambos casos: el call-site
    // recibe el rawBody como string y decide.
    if (
      !contentType.includes('application/json') &&
      !contentType.includes('text/json')
    ) {
      // Trim quotes si Enhance devuelve "string" JSON-encoded en text/plain.
      const trimmed = rawBody.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1) as T;
      }
      return trimmed as T;
    }

    try {
      return JSON.parse(rawBody) as T;
    } catch (cause) {
      const reason =
        cause instanceof Error ? cause.message : 'unknown JSON parse error';
      throw invalidPayloadError(method, path, reason);
    }
  }
}

/** Helper que guards `EnhanceErrorBodyShape | undefined` para tests. */
export type { EnhanceErrorBodyShape };

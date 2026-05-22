/**
 * Sprint 15D Fase 15D.C — tests unit del wrapper HTTP low-level RC.
 *
 * Cobertura:
 *   - Construcción + validación de config.
 *   - Transporte: URL `<base>/<command>.json`, auth en querystring (GET) vs body
 *     (POST), arrays como claves duplicadas (ns=a&ns=b), User-Agent.
 *   - WAF de Cloudflare (403 HTML) → PROVIDER_AUTH_FAILED (findings §3).
 *   - DOS envoltorios de error de negocio ({status:ERROR,message} y
 *     {status:error,error}), con HTTP 200 **y** 500 (findings §4.7).
 *   - Heurística mensaje RC → ProvisionerErrorCode (ADR-081 §7).
 *   - Status HTTP sin envoltorio, red, timeout.
 *   - Id escalar (`signup`) deserializado como número.
 *   - R12: las credenciales NUNCA aparecen en los logs.
 */

import { Logger } from '@nestjs/common';

import { ProvisionerPluginError } from '../../../../core/provisioning/types';

import {
  RESELLERCLUB_PRODUCTION_URL,
  RESELLERCLUB_SANDBOX_URL,
  ResellerClubHttpClient,
  resolveResellerClubBaseUrl,
} from './http-client';

type FetchMock = jest.Mock<Promise<Response>, [string | URL, RequestInit?]>;

function jsonResponse(
  status: number,
  body: unknown,
  contentType = 'application/json',
): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'content-type': contentType },
  });
}

function htmlResponse(status: number, html: string): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
  });
}

async function expectRcError(
  promise: Promise<unknown>,
  code: ProvisionerPluginError['code'],
  retriable: boolean,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ProvisionerPluginError);
  await promise.catch((err: unknown) => {
    const e = err as ProvisionerPluginError;
    expect(e.code).toBe(code);
    expect(e.retriable).toBe(retriable);
  });
}

describe('ResellerClubHttpClient — Sprint 15D Fase 15D.C', () => {
  const BASE_URL = RESELLERCLUB_SANDBOX_URL;
  const USERID = 'reseller-userid-fixture';
  const APIKEY = 'api-key-fixture';
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;
  let client: ResellerClubHttpClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn() as unknown as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    client = new ResellerClubHttpClient({
      baseUrl: BASE_URL,
      authUserId: USERID,
      apiKey: APIKEY,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  // ─── Construcción / URLs ──────────────────────────────────────────────────

  it('rechaza config sin baseUrl / authUserId / apiKey', () => {
    expect(
      () =>
        new ResellerClubHttpClient({
          baseUrl: '',
          authUserId: USERID,
          apiKey: APIKEY,
        }),
    ).toThrow(/baseUrl is required/);
    expect(
      () =>
        new ResellerClubHttpClient({
          baseUrl: BASE_URL,
          authUserId: '',
          apiKey: APIKEY,
        }),
    ).toThrow(/authUserId is required/);
    expect(
      () =>
        new ResellerClubHttpClient({
          baseUrl: BASE_URL,
          authUserId: USERID,
          apiKey: '',
        }),
    ).toThrow(/apiKey is required/);
  });

  it('resolveResellerClubBaseUrl mapea sandbox/production', () => {
    expect(resolveResellerClubBaseUrl('sandbox')).toBe(
      RESELLERCLUB_SANDBOX_URL,
    );
    expect(resolveResellerClubBaseUrl('production')).toBe(
      RESELLERCLUB_PRODUCTION_URL,
    );
  });

  // ─── Transporte ───────────────────────────────────────────────────────────

  it('GET: URL command.json + auth y arrays (claves duplicadas) en querystring + UA', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await client.get('domains/available', {
      'domain-name': 'aelium',
      tlds: ['com', 'net'],
    });
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe(
      `${BASE_URL}/domains/available.json`,
    );
    expect(parsed.searchParams.getAll('tlds')).toEqual(['com', 'net']);
    expect(parsed.searchParams.get('domain-name')).toBe('aelium');
    expect(parsed.searchParams.get('auth-userid')).toBe(USERID);
    expect(parsed.searchParams.get('api-key')).toBe(APIKEY);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/Mozilla/);
    expect(init?.method).toBe('GET');
  });

  it('POST: auth y params en el body form-urlencoded (no en la URL)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, 33566240));
    await client.post('customers/signup', { username: 'a@b.test' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${BASE_URL}/customers/signup.json`);
    expect(String(url)).not.toContain('api-key');
    const body = new URLSearchParams((init?.body as string) ?? '');
    expect(body.get('username')).toBe('a@b.test');
    expect(body.get('auth-userid')).toBe(USERID);
    expect(body.get('api-key')).toBe(APIKEY);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('deserializa un id escalar (signup) como número', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, 33566240));
    const res = await client.post<number>('customers/signup', {});
    expect(res).toBe(33566240);
  });

  it('devuelve el objeto JSON en éxito', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        'aelium.com': { classkey: 'domcno', status: 'available' },
      }),
    );
    const res = await client.get<Record<string, unknown>>('domains/available');
    expect(res['aelium.com']).toEqual({
      classkey: 'domcno',
      status: 'available',
    });
  });

  // ─── Cloudflare WAF ───────────────────────────────────────────────────────

  it('403 HTML de Cloudflare → PROVIDER_AUTH_FAILED (no retriable)', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        403,
        '<html><body>Attention Required! | Cloudflare</body></html>',
      ),
    );
    await expectRcError(
      client.get('domains/available'),
      'PROVIDER_AUTH_FAILED',
      false,
    );
  });

  // ─── Envoltorios de error de negocio (los DOS, HTTP 200 y 500) ────────────

  it('{status:ERROR, message} (HTTP 200) → mapea por mensaje (no disponible)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: 'ERROR', message: 'Domain not available' }),
    );
    await expectRcError(
      client.get('domains/available'),
      'DOMAIN_UNAVAILABLE',
      false,
    );
  });

  it('{status:error, error} (HTTP 200, p. ej. register) se detecta como negocio', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: 'error',
        error: 'NameServer ns2.aelium.net is not a valid Nameserver',
      }),
    );
    // Mensaje no clasificable → PROVIDER_INTERNAL_ERROR no-retriable (definitivo).
    await expectRcError(
      client.post('domains/register'),
      'PROVIDER_INTERNAL_ERROR',
      false,
    );
  });

  it('envoltorio de negocio con HTTP 500 se mapea por el envoltorio, no por el status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { status: 'ERROR', message: 'Customer X not found' }),
    );
    // "not found" no es de dominio → fallback no-retriable (NO PROVIDER_INTERNAL_ERROR retriable de 5xx).
    await expectRcError(
      client.get('customers/details'),
      'PROVIDER_INTERNAL_ERROR',
      false,
    );
  });

  it.each([
    ['Domain is a premium domain', 'DOMAIN_PREMIUM'],
    [
      'es_tipo_identificacion (NIF) is required for .es',
      'REGISTRANT_INELIGIBLE',
    ],
    ['Domain is in Redemption Grace Period', 'DOMAIN_IN_REDEMPTION'],
    ['Domain has theft protection lock enabled', 'REGISTRAR_LOCKED'],
    ['Invalid api-key / authentication failed', 'PROVIDER_AUTH_FAILED'],
  ])('mensaje "%s" → %s', async (message, code) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: 'ERROR', message }),
    );
    await expectRcError(
      client.get('domains/x'),
      code as ProvisionerPluginError['code'],
      false,
    );
  });

  it('mensaje de rate limit → PROVIDER_RATE_LIMITED (retriable)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: 'ERROR', message: 'Rate limit exceeded' }),
    );
    await expectRcError(client.get('domains/x'), 'PROVIDER_RATE_LIMITED', true);
  });

  // ─── Errores HTTP sin envoltorio de negocio ───────────────────────────────

  it('HTTP 429 sin envoltorio → PROVIDER_RATE_LIMITED (retriable)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, ''));
    await expectRcError(client.get('domains/x'), 'PROVIDER_RATE_LIMITED', true);
  });

  it('HTTP 500 sin envoltorio → PROVIDER_INTERNAL_ERROR (retriable)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, ''));
    await expectRcError(
      client.get('domains/x'),
      'PROVIDER_INTERNAL_ERROR',
      true,
    );
  });

  // ─── Red / timeout ────────────────────────────────────────────────────────

  it('AbortError → PROVIDER_TIMEOUT (retriable)', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    await expectRcError(client.get('domains/x'), 'PROVIDER_TIMEOUT', true);
  });

  it('fallo de red → NETWORK_ERROR (retriable)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expectRcError(client.get('domains/x'), 'NETWORK_ERROR', true);
  });

  // ─── Seguridad (R12) ──────────────────────────────────────────────────────

  it('R12: las credenciales NUNCA aparecen en los logs', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: 'ERROR', message: 'Domain not available' }),
    );
    await client.get('domains/available').catch(() => undefined);
    for (const call of warnSpy.mock.calls) {
      const logged = String(call[0]);
      expect(logged).not.toContain(APIKEY);
      expect(logged).not.toContain(USERID);
    }
  });
});

/**
 * Sprint 15C Fase 15C.B — tests unit del wrapper HTTP low-level.
 *
 * Cobertura:
 *   - Construcción correcta de URL (baseUrl + path + query string).
 *   - Headers canónicos: Authorization Bearer + Accept JSON + Content-Type
 *     JSON (en POST/PATCH/PUT) + User-Agent + skipAuth.
 *   - Mapping HTTP status → ProvisionerErrorCode + retriable correcto.
 *   - Mapping network error / abort / timeout → códigos canónicos.
 *   - Parse de respuestas JSON + text/plain (SSO OTP URL + /version SemVer).
 *   - Status 204 No Content devuelve null (no intenta parsear).
 *   - Body 4xx con `enhance_code` propaga al cause.
 *   - encodeURIComponent en path params evitando inyección.
 */

import { ProvisionerPluginError } from '../../../../core/provisioning/types';

import { EnhanceHttpClient } from './http-client';

type FetchMock = jest.Mock<Promise<Response>, [string | URL, RequestInit?]>;

describe('EnhanceHttpClient — Sprint 15C Fase 15C.B', () => {
  const BASE_URL = 'https://enhance.test.aelium.net';
  const TOKEN = 'super-admin-token-fixture';
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;
  let client: EnhanceHttpClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn() as unknown as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    client = new EnhanceHttpClient({
      baseUrl: BASE_URL,
      apiToken: TOKEN,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // ─── Construcción ───────────────────────────────────────────────────────

  it('rechaza configuración sin baseUrl o sin apiToken', () => {
    expect(
      () => new EnhanceHttpClient({ baseUrl: '', apiToken: TOKEN }),
    ).toThrow(/baseUrl is required/);
    expect(
      () => new EnhanceHttpClient({ baseUrl: BASE_URL, apiToken: '' }),
    ).toThrow(/apiToken is required/);
  });

  it('normaliza baseUrl quitando trailing slashes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'org-1' }));
    const c = new EnhanceHttpClient({
      baseUrl: `${BASE_URL}//`,
      apiToken: TOKEN,
    });
    await c.get('/orgs/org-1');
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/orgs/org-1`,
      expect.any(Object),
    );
  });

  // ─── Headers canónicos ──────────────────────────────────────────────────

  it('GET incluye Authorization Bearer + Accept JSON + User-Agent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, '1.0.0'));
    await client.get('/orgs/abc');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.Accept).toBe('application/json');
    expect(headers['User-Agent']).toMatch(/Aelium-Dashboard\/1\.0/);
    // GET sin body NO debe incluir Content-Type.
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('POST con body añade Content-Type application/json', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'cust-1' }));
    await client.post('/orgs/master/customers', { name: 'ACME' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'ACME' }));
  });

  it('skipAuth: true omite Authorization (caso /version)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, '1.0.0'));
    await client.get('/version', { skipAuth: true });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    // El resto de headers siguen presentes.
    expect(headers.Accept).toBe('application/json');
    expect(headers['User-Agent']).toMatch(/Aelium-Dashboard/);
  });

  it('userAgent custom override aplicado', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const c = new EnhanceHttpClient({
      baseUrl: BASE_URL,
      apiToken: TOKEN,
      userAgent: 'custom-agent/9.9.9',
    });
    await c.get('/version', { skipAuth: true });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'custom-agent/9.9.9',
    );
  });

  // ─── Query params ───────────────────────────────────────────────────────

  it('serializa query params en la URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));
    await client.get('/orgs/master/customers', {
      query: { search: 'cliente@aelium.test', page: 1, active: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/orgs/master/customers?search=cliente%40aelium.test&page=1&active=true`,
      expect.any(Object),
    );
  });

  it('omite query params undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await client.get('/orgs/abc', {
      query: { force: undefined, refresh: 'true' },
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE_URL}/orgs/abc?refresh=true`);
  });

  // ─── Parse de respuestas ────────────────────────────────────────────────

  it('parsea JSON application/json', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { id: 'org-1', name: 'ACME' }),
    );
    const result = await client.get<{ id: string; name: string }>(
      '/orgs/org-1',
    );
    expect(result).toEqual({ id: 'org-1', name: 'ACME' });
  });

  it('devuelve null para HTTP 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    const result = await client.delete('/orgs/abc/subscriptions/42');
    expect(result).toBeNull();
  });

  it('parsea text/plain con quotes JSON-encoded como string sin quotes (SemVer /version)', async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, '"1.0.0-alpha.35"'));
    const result = await client.get<string>('/version', { skipAuth: true });
    expect(result).toBe('1.0.0-alpha.35');
  });

  it('parsea text/plain sin quotes como string raw (SSO OTP URL)', async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(200, 'https://panel.test/login/sessions/sso?otp=abc-123'),
    );
    const result = await client.get<string>('/orgs/cust/members/owner/sso');
    expect(result).toBe('https://panel.test/login/sessions/sso?otp=abc-123');
  });

  it('lanza INVALID_PAYLOAD si JSON malformado en respuesta 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(client.get('/orgs/abc')).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
      retriable: false,
    });
  });

  // ─── Mapping HTTP status → ProvisionerErrorCode ─────────────────────────

  it('401 → PROVIDER_AUTH_FAILED, retriable=false', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { code: 'Unauthorized', message: 'invalid token' }),
    );
    await expectError(
      () => client.get('/orgs/abc'),
      'PROVIDER_AUTH_FAILED',
      false,
    );
  });

  it('403 → PROVIDER_AUTH_FAILED', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 'Forbidden' }));
    await expectError(
      () => client.get('/orgs/abc'),
      'PROVIDER_AUTH_FAILED',
      false,
    );
  });

  it('404 → INVALID_STATE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { code: 'NotFound' }));
    await expectError(
      () => client.get('/orgs/abc/subscriptions/9999'),
      'INVALID_STATE',
      false,
    );
  });

  it('408 → PROVIDER_TIMEOUT, retriable=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(408, {}));
    await expectError(() => client.get('/orgs/abc'), 'PROVIDER_TIMEOUT', true);
  });

  it('409 Conflict → INVALID_STATE (idempotencia delegada al plugin)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        code: 'ConflictError',
        message: 'customer already exists',
      }),
    );
    await expectError(
      () => client.post('/orgs/master/customers', { name: 'ACME' }),
      'INVALID_STATE',
      false,
    );
  });

  it('422 → INVALID_PAYLOAD', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { code: 'ValidationError' }),
    );
    await expectError(
      () => client.post('/orgs/abc/websites', { domain: '' }),
      'INVALID_PAYLOAD',
      false,
    );
  });

  it('429 → PROVIDER_RATE_LIMITED, retriable=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, {}));
    await expectError(
      () => client.get('/orgs/abc'),
      'PROVIDER_RATE_LIMITED',
      true,
    );
  });

  it('500 → PROVIDER_INTERNAL_ERROR, retriable=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    await expectError(
      () => client.get('/orgs/abc'),
      'PROVIDER_INTERNAL_ERROR',
      true,
    );
  });

  it('504 → PROVIDER_TIMEOUT, retriable=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(504, {}));
    await expectError(() => client.get('/orgs/abc'), 'PROVIDER_TIMEOUT', true);
  });

  it('400 (otros 4xx) → PROVIDER_INTERNAL_ERROR, retriable=false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, {}));
    await expectError(
      () => client.get('/orgs/abc'),
      'PROVIDER_INTERNAL_ERROR',
      false,
    );
  });

  // ─── Network errors ─────────────────────────────────────────────────────

  it('fetch lanza error de red → NETWORK_ERROR, retriable=true', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('ECONNREFUSED'), { name: 'TypeError' }),
    );
    await expectError(() => client.get('/orgs/abc'), 'NETWORK_ERROR', true);
  });

  it('AbortError tras timeout → PROVIDER_TIMEOUT, retriable=true', async () => {
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          }, 5),
        ),
    );
    const c = new EnhanceHttpClient({
      baseUrl: BASE_URL,
      apiToken: TOKEN,
      timeoutMs: 5,
    });
    await expectError(() => c.get('/orgs/abc'), 'PROVIDER_TIMEOUT', true);
  });

  // ─── Embedding del enhance_code en error message ────────────────────────

  it('mensaje del error embebe enhance_code y message del body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        code: 'CustomerAlreadyExists',
        message: 'A customer with this email already exists',
      }),
    );
    let captured: ProvisionerPluginError | undefined;
    try {
      await client.post('/orgs/master/customers', { name: 'ACME' });
    } catch (err) {
      captured = err as ProvisionerPluginError;
    }
    expect(captured).toBeInstanceOf(ProvisionerPluginError);
    expect(captured?.message).toContain('HTTP 409');
    expect(captured?.message).toContain('CustomerAlreadyExists');
    expect(captured?.message).toContain('already exists');
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function textResponse(status: number, body: string): Response {
    return new Response(body, {
      status,
      headers: { 'content-type': 'text/plain' },
    });
  }

  function emptyResponse(status: number): Response {
    return new Response(null, { status });
  }

  async function expectError(
    fn: () => Promise<unknown>,
    expectedCode: string,
    expectedRetriable: boolean,
  ): Promise<void> {
    let captured: unknown;
    try {
      await fn();
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ProvisionerPluginError);
    const ppe = captured as ProvisionerPluginError;
    expect(ppe.code).toBe(expectedCode);
    expect(ppe.retriable).toBe(expectedRetriable);
  }
});

/**
 * Sprint 15C Fase 15C.B — tests unit del high-level EnhanceApiClient.
 *
 * Cobertura: para cada método, verifica que construye correctamente la
 * request HTTP (path + method + body + query) y que devuelve el shape
 * tipado correctamente. NO verifica errores HTTP (eso vive en
 * `http-client.spec.ts`) — aquí solo el happy path por método.
 *
 * Bloques cubiertos (mapping ADR-083 §3-§9):
 *   - System probe (Fase C onActivated) — 2 métodos.
 *   - Customers (Fase C step 1 + lazy create) — 2 métodos.
 *   - Logins (Fase C step 2 + Fase E reset) — 2 métodos.
 *   - Members (Fase C steps 3-4 + Fase F SSO) — 4 métodos.
 *   - Subscriptions (Fase C step 5 + Fase E + Fase H reconcile) — 6 métodos.
 *   - Websites (Fase C step 6 + Fase H reconcile) — 4 métodos.
 *   - DNS records per-zone (Fase G) — 4 métodos.
 *   - Default DNS records cluster-wide (Fase D) — 4 métodos.
 *
 * Total: ~28 métodos. Cobertura por método: 1 happy-path test
 * (request shape + response decode) — los errores ya están cubiertos
 * exhaustivamente en `http-client.spec.ts`.
 */

import { EnhanceApiClient } from './client';

type FetchMock = jest.Mock<Promise<Response>, [string | URL, RequestInit?]>;

describe('EnhanceApiClient — Sprint 15C Fase 15C.B', () => {
  const BASE_URL = 'https://enhance.test.aelium.net';
  const TOKEN = 'super-admin-token-fixture';
  const MASTER = '00000000-0000-0000-0000-00000000aaaa';
  const CUST = '00000000-0000-0000-0000-00000000bbbb';
  const MEMBER = '00000000-0000-0000-0000-00000000cccc';
  const LOGIN = '00000000-0000-0000-0000-00000000dddd';
  const WEBSITE = '00000000-0000-0000-0000-00000000eeee';
  const SUB_ID = 42;
  const RECORD_ID = 'rec-9999';
  const DEFAULT_RECORD_ID = 'def-1111';
  const DOMAIN = 'mi-cliente.es';

  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;
  let client: EnhanceApiClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn() as unknown as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    client = new EnhanceApiClient({
      baseUrl: BASE_URL,
      apiToken: TOKEN,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // ─── 1. System probe ────────────────────────────────────────────────────

  describe('System probe (Fase C onActivated + test-connection)', () => {
    it('getVersion → GET /version sin auth, devuelve string SemVer', async () => {
      fetchMock.mockResolvedValueOnce(textJson(200, '"1.0.0-alpha.35"'));
      const result = await client.getVersion();
      expect(result).toBe('1.0.0-alpha.35');
      expectRequest('GET', '/version');
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(
        (init.headers as Record<string, string>).Authorization,
      ).toBeUndefined();
    });

    it('getOrg → GET /orgs/{orgId} con auth', async () => {
      const org = orgFixture(MASTER);
      fetchMock.mockResolvedValueOnce(json(200, org));
      const result = await client.getOrg(MASTER);
      expect(result).toEqual(org);
      expectRequest('GET', `/orgs/${MASTER}`);
    });
  });

  // ─── 2. Customers ────────────────────────────────────────────────────────

  describe('Customers (Fase C step 1 + lazy create)', () => {
    it('createCustomer → POST /orgs/{master}/customers con body NewCustomer', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: CUST }));
      const result = await client.createCustomer(MASTER, {
        name: 'ACME, S.L.',
      });
      expect(result).toEqual({ id: CUST });
      expectRequest('POST', `/orgs/${MASTER}/customers`, {
        name: 'ACME, S.L.',
      });
    });

    it('searchCustomersByEmail → GET con query ?search=...', async () => {
      const listing = { items: [orgFixture(CUST)], total: 1 };
      fetchMock.mockResolvedValueOnce(json(200, listing));
      const result = await client.searchCustomersByEmail(
        MASTER,
        'cliente@aelium.test',
      );
      expect(result).toEqual(listing);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe(
        `${BASE_URL}/orgs/${MASTER}/customers?search=cliente%40aelium.test`,
      );
    });
  });

  // ─── 3. Logins ──────────────────────────────────────────────────────────

  describe('Logins (Fase C step 2 + Fase E reset)', () => {
    it('createLogin → POST /logins?orgId={cust} con body LoginInfo', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: LOGIN }));
      const body = {
        email: 'cliente@aelium.test',
        password: 'random-uuid',
        name: 'ACME',
      };
      const result = await client.createLogin(CUST, body);
      expect(result).toEqual({ id: LOGIN });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe(`${BASE_URL}/logins?orgId=${CUST}`);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(body));
    });

    it('resetLoginPassword → PUT /v2/logins/{id}/password con body NewPassword', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.resetLoginPassword(LOGIN, { NewPassword: 'newSecret123!' });
      expectRequest('PUT', `/v2/logins/${LOGIN}/password`, {
        NewPassword: 'newSecret123!',
      });
    });
  });

  // ─── 4. Members ─────────────────────────────────────────────────────────

  describe('Members (Fase C steps 3-4 + Fase F SSO)', () => {
    it('addMember → POST /orgs/{cust}/members con body NewMember', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: MEMBER }));
      const result = await client.addMember(CUST, {
        loginId: LOGIN,
        roles: ['Owner'],
      });
      expect(result).toEqual({ id: MEMBER });
      expectRequest('POST', `/orgs/${CUST}/members`, {
        loginId: LOGIN,
        roles: ['Owner'],
      });
    });

    it('setOwner → PUT /orgs/{cust}/owner con body OrgOwnerUpdate', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.setOwner(CUST, { memberId: MEMBER });
      expectRequest('PUT', `/orgs/${CUST}/owner`, { memberId: MEMBER });
    });

    it('getMember → GET /orgs/{cust}/members/{memberId}', async () => {
      const member = {
        id: MEMBER,
        loginId: LOGIN,
        isActive: true,
        email: 'cliente@aelium.test',
        name: 'ACME',
        roles: ['Owner'],
        siteAccesses: [],
        notifications: [],
        joinedAt: '2026-05-08',
        colorCode: '#abc',
        authMethod: 'basic',
      };
      fetchMock.mockResolvedValueOnce(json(200, member));
      const result = await client.getMember(CUST, MEMBER);
      expect(result).toEqual(member);
      expectRequest('GET', `/orgs/${CUST}/members/${MEMBER}`);
    });

    it('getMemberSsoOtpUrl → GET /orgs/{cust}/members/{m}/sso devuelve OTP URL string', async () => {
      const otp =
        'https://panel.test.aelium.net/login/sessions/sso?otp=11111111-2222-3333-4444-555555555555';
      fetchMock.mockResolvedValueOnce(textJson(200, `"${otp}"`));
      const result = await client.getMemberSsoOtpUrl(CUST, MEMBER);
      expect(result).toBe(otp);
      expectRequest('GET', `/orgs/${CUST}/members/${MEMBER}/sso`);
    });
  });

  // ─── 5. Subscriptions ───────────────────────────────────────────────────

  describe('Subscriptions (Fase C step 5 + Fase E + Fase H reconcile)', () => {
    it('createSubscription → POST con planId, devuelve id integer', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: SUB_ID }));
      const result = await client.createSubscription(MASTER, CUST, {
        planId: 7,
      });
      expect(result).toEqual({ id: SUB_ID });
      expectRequest('POST', `/orgs/${MASTER}/customers/${CUST}/subscriptions`, {
        planId: 7,
      });
    });

    it('getSubscription → GET con id integer en path', async () => {
      const sub = subscriptionFixture();
      fetchMock.mockResolvedValueOnce(json(200, sub));
      const result = await client.getSubscription(CUST, SUB_ID);
      expect(result).toEqual(sub);
      expectRequest('GET', `/orgs/${CUST}/subscriptions/${SUB_ID}`);
    });

    it('patchSubscription { isSuspended: true } → PATCH suspend', async () => {
      const sub = subscriptionFixture({ status: 'active' });
      fetchMock.mockResolvedValueOnce(json(200, sub));
      const result = await client.patchSubscription(CUST, SUB_ID, {
        isSuspended: true,
      });
      expect(result).toEqual(sub);
      expectRequest('PATCH', `/orgs/${CUST}/subscriptions/${SUB_ID}`, {
        isSuspended: true,
      });
    });

    it('patchSubscription { planId } → PATCH change_package admin-only', async () => {
      const sub = subscriptionFixture({ planId: 99 });
      fetchMock.mockResolvedValueOnce(json(200, sub));
      const result = await client.patchSubscription(CUST, SUB_ID, {
        planId: 99,
      });
      expect(result.planId).toBe(99);
      expectRequest('PATCH', `/orgs/${CUST}/subscriptions/${SUB_ID}`, {
        planId: 99,
      });
    });

    it('deleteSubscription default → DELETE sin force=true', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.deleteSubscription(CUST, SUB_ID);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe(`${BASE_URL}/orgs/${CUST}/subscriptions/${SUB_ID}`);
    });

    it('deleteSubscription { force: true } → DELETE con query ?force=true', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.deleteSubscription(CUST, SUB_ID, { force: true });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe(
        `${BASE_URL}/orgs/${CUST}/subscriptions/${SUB_ID}?force=true`,
      );
    });

    it('getSubscriptionBandwidth refreshCache → GET con query ?refreshCache=true', async () => {
      const bw = { usedMb: 1024 };
      fetchMock.mockResolvedValueOnce(json(200, bw));
      const result = await client.getSubscriptionBandwidth(CUST, SUB_ID, {
        refreshCache: true,
      });
      expect(result).toEqual(bw);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe(
        `${BASE_URL}/orgs/${CUST}/subscriptions/${SUB_ID}/bandwidth?refreshCache=true`,
      );
    });

    it('calculateResourceUsage → PUT, devuelve UsedResourcesFullListing', async () => {
      const listing = { items: [{ name: 'disk', total: 10000, usage: 2500 }] };
      fetchMock.mockResolvedValueOnce(json(200, listing));
      const result = await client.calculateResourceUsage(CUST, SUB_ID);
      expect(result).toEqual(listing);
      expectRequest(
        'PUT',
        `/orgs/${CUST}/subscriptions/${SUB_ID}/calculate-resource-usage`,
      );
    });
  });

  // ─── 6. Websites ────────────────────────────────────────────────────────

  describe('Websites (Fase C step 6 + Fase H reconcile)', () => {
    it('createWebsite → POST con body NewWebsite', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: WEBSITE }));
      const result = await client.createWebsite(CUST, {
        domain: DOMAIN,
        subscriptionId: SUB_ID,
      });
      expect(result).toEqual({ id: WEBSITE });
      expectRequest('POST', `/orgs/${CUST}/websites`, {
        domain: DOMAIN,
        subscriptionId: SUB_ID,
      });
    });

    it('getWebsite → GET con websiteId uuid en path', async () => {
      const ws = websiteFixture();
      fetchMock.mockResolvedValueOnce(json(200, ws));
      const result = await client.getWebsite(CUST, WEBSITE);
      expect(result).toEqual(ws);
      expectRequest('GET', `/orgs/${CUST}/websites/${WEBSITE}`);
    });

    it('patchWebsite { isSuspended } → PATCH', async () => {
      const ws = websiteFixture();
      fetchMock.mockResolvedValueOnce(json(200, ws));
      await client.patchWebsite(CUST, WEBSITE, { isSuspended: true });
      expectRequest('PATCH', `/orgs/${CUST}/websites/${WEBSITE}`, {
        isSuspended: true,
      });
    });

    it('deleteWebsite → DELETE', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.deleteWebsite(CUST, WEBSITE);
      expectRequest('DELETE', `/orgs/${CUST}/websites/${WEBSITE}`);
    });
  });

  // ─── 7. DNS records per-zone ────────────────────────────────────────────

  describe('DNS records per-zone (Fase G UI)', () => {
    it('getDnsZone → GET .../dns-zone con domain en path', async () => {
      const zone = dnsZoneFixture();
      fetchMock.mockResolvedValueOnce(json(200, zone));
      const result = await client.getDnsZone(CUST, WEBSITE, DOMAIN);
      expect(result).toEqual(zone);
      expectRequest(
        'GET',
        `/orgs/${CUST}/websites/${WEBSITE}/domains/${DOMAIN}/dns-zone`,
      );
    });

    it('addDnsRecord → POST .../dns-zone/records con body NewDnsRecord', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: RECORD_ID }));
      const body = {
        kind: 'A' as const,
        name: 'shop',
        value: '203.0.113.5',
        ttl: 3600,
      };
      const result = await client.addDnsRecord(CUST, WEBSITE, DOMAIN, body);
      expect(result).toEqual({ id: RECORD_ID });
      expectRequest(
        'POST',
        `/orgs/${CUST}/websites/${WEBSITE}/domains/${DOMAIN}/dns-zone/records`,
        body,
      );
    });

    it('updateDnsRecord → PATCH .../records/{recordId}', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.updateDnsRecord(CUST, WEBSITE, DOMAIN, RECORD_ID, {
        ttl: 600,
      });
      expectRequest(
        'PATCH',
        `/orgs/${CUST}/websites/${WEBSITE}/domains/${DOMAIN}/dns-zone/records/${RECORD_ID}`,
        { ttl: 600 },
      );
    });

    it('deleteDnsRecord → DELETE .../records/{recordId}', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.deleteDnsRecord(CUST, WEBSITE, DOMAIN, RECORD_ID);
      expectRequest(
        'DELETE',
        `/orgs/${CUST}/websites/${WEBSITE}/domains/${DOMAIN}/dns-zone/records/${RECORD_ID}`,
      );
    });
  });

  // ─── 8. Default DNS records cluster-wide ────────────────────────────────

  describe('Default DNS records cluster-wide (Fase D bootstrap)', () => {
    it('listDefaultDnsRecords → GET /v2/settings/dns/default-records', async () => {
      const records = [
        {
          id: DEFAULT_RECORD_ID,
          kind: 'A' as const,
          name: '@',
          value: '1.2.3.4',
        },
      ];
      fetchMock.mockResolvedValueOnce(json(200, records));
      const result = await client.listDefaultDnsRecords();
      expect(result).toEqual(records);
      expectRequest('GET', '/v2/settings/dns/default-records');
    });

    it('addDefaultDnsRecord → POST /v2/settings/dns/default-records', async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: DEFAULT_RECORD_ID }));
      const body = {
        kind: 'NS' as const,
        name: '@',
        value: 'ns1.aelium.net',
      };
      const result = await client.addDefaultDnsRecord(body);
      expect(result).toEqual({ id: DEFAULT_RECORD_ID });
      expectRequest('POST', '/v2/settings/dns/default-records', body);
    });

    it('updateDefaultDnsRecord → PATCH .../{id}', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.updateDefaultDnsRecord(DEFAULT_RECORD_ID, {
        value: 'ns1-new.aelium.net',
      });
      expectRequest(
        'PATCH',
        `/v2/settings/dns/default-records/${DEFAULT_RECORD_ID}`,
        { value: 'ns1-new.aelium.net' },
      );
    });

    it('deleteDefaultDnsRecord → DELETE .../{id}', async () => {
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      await client.deleteDefaultDnsRecord(DEFAULT_RECORD_ID);
      expectRequest(
        'DELETE',
        `/v2/settings/dns/default-records/${DEFAULT_RECORD_ID}`,
      );
    });
  });

  // ─── 9. Plans (Sprint 15C Fase 15C.E — ADR-083 Amendment A3) ─────────────

  describe('Plans (Fase 15C.E admin-only — alimenta dropdown change_package)', () => {
    it('listPlans → GET /orgs/{org}/plans devuelve PlansListing', async () => {
      const listing = {
        items: [
          {
            id: 1,
            name: 'Web Starter',
            subscriptionsCount: 12,
            planType: 'shared',
            createdAt: '2026-01-15T10:00:00Z',
          },
          {
            id: 2,
            name: 'Web Pro',
            subscriptionsCount: 7,
            planType: 'shared',
            createdAt: '2026-01-15T10:00:00Z',
          },
        ],
        total: 2,
      };
      fetchMock.mockResolvedValueOnce(json(200, listing));
      const result = await client.listPlans(MASTER);
      expect(result).toEqual(listing);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(1);
      expect(result.items[0].name).toBe('Web Starter');
      expectRequest('GET', `/orgs/${MASTER}/plans`);
    });

    it('listPlans → 404 mapea a INVALID_STATE (org no existe)', async () => {
      fetchMock.mockResolvedValueOnce(
        json(404, { code: 'NotFound', message: 'org not found' }),
      );
      await expect(
        client.listPlans('00000000-0000-0000-0000-000000000999'),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });
  });

  // ─── Fixtures + helpers ─────────────────────────────────────────────────

  function orgFixture(id: string, over: Record<string, unknown> = {}) {
    return {
      id,
      name: 'Test Org',
      status: 'active',
      subscriptionsCount: 0,
      websitesCount: 0,
      createdAt: '2026-05-08T10:00:00Z',
      ...over,
    };
  }

  function subscriptionFixture(over: Record<string, unknown> = {}) {
    return {
      id: SUB_ID,
      planId: 7,
      planName: 'Web Pro',
      subscriberId: CUST,
      vendorId: MASTER,
      status: 'active',
      resources: [],
      allowances: [],
      selections: [],
      planType: 'hosting',
      allowedPhpVersions: ['8.2'],
      defaultPhpVersion: '8.2',
      redisAllowed: false,
      friendlyName: 'Plan Web Pro',
      persistentAppsAllowed: false,
      ...over,
    };
  }

  function websiteFixture(over: Record<string, unknown> = {}) {
    return {
      id: WEBSITE,
      domain: { id: 'dom-1', domain: DOMAIN },
      aliases: [],
      subdomains: [],
      status: 'active',
      colorCode: '#abc',
      size: 0,
      orgId: CUST,
      kind: 'normal',
      createdAt: '2026-05-08T10:00:00Z',
      ...over,
    };
  }

  function dnsZoneFixture() {
    return {
      origin: DOMAIN,
      soa: {
        adminEmail: 'hostmaster@aelium.net',
        nameServer: 'ns1.aelium.net',
        expire: 1209600,
        refresh: 86400,
        retry: 7200,
        ttl: 3600,
      },
      records: [
        {
          id: 'rec-apex',
          kind: 'A',
          name: '@',
          value: '203.0.113.5',
          ttl: 3600,
          proxy: false,
        },
      ],
    };
  }

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function textJson(status: number, body: string): Response {
    return new Response(body, {
      status,
      headers: { 'content-type': 'text/plain' },
    });
  }

  function emptyResponse(status: number): Response {
    return new Response(null, { status });
  }

  function expectRequest(
    method: string,
    expectedPath: string,
    expectedBody?: unknown,
  ): void {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE_URL}${expectedPath}`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe(method);
    if (expectedBody !== undefined) {
      expect(init.body).toBe(JSON.stringify(expectedBody));
    } else {
      expect(init.body).toBeUndefined();
    }
  }
});

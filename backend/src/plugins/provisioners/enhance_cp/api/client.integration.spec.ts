/**
 * Sprint 15C Fase 15C.B — tests integration `EnhanceApiClient` ↔ MockEnhanceServer.
 *
 * Validan que el cliente HTTP funciona correctamente contra un servidor
 * Express que responde con shapes canónicos del spec orchd v12.21.3.
 *
 * Cobertura:
 *   - Provision flow 6-step end-to-end (ADR-083 §3 decisión 10).
 *   - SSO 2-call OTP flow (ADR-083 §4 decisión 13).
 *   - DNS zone + records CRUD (ADR-083 §5 decisión 19).
 *   - Default DNS records bootstrap (ADR-083 §5 decisión 20).
 *   - Idempotencia: 409 Conflict + recovery via search-by-email
 *     (ADR-083 §2 decisión 8).
 *   - Reconcile reads: getSubscription + getWebsite (ADR-083 §6 decisión 24).
 *   - Auth: 401 si Bearer token incorrecto (ADR-083 §1 decisión 5).
 *
 * El cliente HTTP usa `fetch` nativo Node.js — no se mockea aquí. El
 * único stub es el server (Express) que reemplaza Enhance live.
 */

import { ProvisionerPluginError } from '../../../../core/provisioning/types';

import { startMockEnhanceServer } from '../../../../../test/mocks/enhance-server';

import { EnhanceApiClient } from './client';

describe('EnhanceApiClient ↔ MockEnhanceServer (integration)', () => {
  const TOKEN = 'test-token-fixture';
  const MASTER = '00000000-0000-0000-0000-00000000aaaa';
  let mock: Awaited<ReturnType<typeof startMockEnhanceServer>>;
  let client: EnhanceApiClient;

  beforeAll(async () => {
    mock = await startMockEnhanceServer({
      seed: {
        apiToken: TOKEN,
        masterOrgId: MASTER,
      },
    });
    client = new EnhanceApiClient({
      baseUrl: mock.baseUrl,
      apiToken: TOKEN,
    });
  });

  afterAll(async () => {
    await mock.stop();
  });

  afterEach(() => {
    mock.reset();
  });

  // ─── Test-connection (Fase C onActivated) ───────────────────────────────

  describe('Auth probe (test-connection ADR-083 §1 decisión 5)', () => {
    it('GET /version sin auth devuelve SemVer string', async () => {
      const version = await client.getVersion();
      expect(version).toBe('12.21.3');
    });

    it('GET /orgs/{master} con auth válido devuelve Master org', async () => {
      const org = await client.getOrg(MASTER);
      expect(org.id).toBe(MASTER);
      expect(org.status).toBe('active');
    });

    it('GET /orgs/{master} con token inválido → PROVIDER_AUTH_FAILED', async () => {
      const badClient = new EnhanceApiClient({
        baseUrl: mock.baseUrl,
        apiToken: 'wrong-token',
      });
      await expect(badClient.getOrg(MASTER)).rejects.toMatchObject({
        code: 'PROVIDER_AUTH_FAILED',
        retriable: false,
      });
    });
  });

  // ─── Provision flow 6-step end-to-end ───────────────────────────────────

  describe('Provision flow 6-step (ADR-083 §3 decisión 10)', () => {
    it('ejecuta los 6 pasos canónicos y deja state coherente en el mock', async () => {
      // Step 1: createCustomer
      const customer = await client.createCustomer(MASTER, {
        name: 'ACME Test, S.L.',
      });
      expect(customer.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      // Step 2: createLogin
      const login = await client.createLogin(customer.id, {
        email: 'qa-aelium@aelium.test',
        password: 'random-uuid-pwd',
        name: 'ACME Test, S.L.',
      });
      expect(login.id).toBeTruthy();

      // Step 3: addMember Owner
      const member = await client.addMember(customer.id, {
        loginId: login.id,
        roles: ['Owner'],
      });
      expect(member.id).toBeTruthy();

      // Step 4: setOwner
      await expect(
        client.setOwner(customer.id, { memberId: member.id }),
      ).resolves.toBeUndefined();

      // Verify mock state: el customer org ahora tiene ownerId + ownerLoginId.
      const orgAfter = await client.getOrg(customer.id);
      expect(orgAfter.ownerId).toBe(member.id);
      expect(orgAfter.ownerLoginId).toBe(login.id);
      expect(orgAfter.ownerEmail).toBe('qa-aelium@aelium.test');

      // Step 5: createSubscription
      const sub = await client.createSubscription(MASTER, customer.id, {
        planId: 7,
      });
      expect(typeof sub.id).toBe('number');
      expect(sub.id).toBeGreaterThanOrEqual(1000);

      // Step 6: createWebsite
      const ws = await client.createWebsite(customer.id, {
        domain: 'mi-cliente.es',
        subscriptionId: sub.id,
      });
      expect(ws.id).toBeTruthy();

      // Validar end-to-end: getSubscription + getWebsite reflejan el estado.
      const subFresh = await client.getSubscription(customer.id, sub.id);
      expect(subFresh.subscriberId).toBe(customer.id);
      expect(subFresh.planId).toBe(7);
      expect(subFresh.status).toBe('active');

      const wsFresh = await client.getWebsite(customer.id, ws.id);
      expect(wsFresh.domain.domain).toBe('mi-cliente.es');
      expect(wsFresh.subscriptionId).toBe(sub.id);
      expect(wsFresh.status).toBe('active');
    });

    it('idempotencia step 2: POST /logins con email existente → 409 → INVALID_STATE', async () => {
      const customer = await client.createCustomer(MASTER, { name: 'ACME' });
      await client.createLogin(customer.id, {
        email: 'duplicado@aelium.test',
        password: 'uuid-1',
        name: 'ACME',
      });
      // Segundo intento con MISMO email → mock responde 409.
      await expect(
        client.createLogin(customer.id, {
          email: 'duplicado@aelium.test',
          password: 'uuid-2',
          name: 'ACME',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_STATE',
        retriable: false,
      });
    });
  });

  // ─── Search-by-email idempotency recovery ───────────────────────────────

  describe('Idempotency recovery (ADR-083 §2 decisión 8 step 2)', () => {
    it('searchCustomersByEmail tras crear customer → recupera el ownerId/ownerLoginId', async () => {
      // Setup: provision flow parcial (steps 1-4).
      const customer = await client.createCustomer(MASTER, {
        name: 'Recovery',
      });
      const login = await client.createLogin(customer.id, {
        email: 'recovery@aelium.test',
        password: 'uuid',
        name: 'Recovery',
      });
      const member = await client.addMember(customer.id, {
        loginId: login.id,
        roles: ['Owner'],
      });
      await client.setOwner(customer.id, { memberId: member.id });

      // Search by email — el plugin lo invocaría tras un crash mid-flight
      // para recuperar el mapping sin re-ejecutar el flow 6-step.
      const listing = await client.searchCustomersByEmail(
        MASTER,
        'recovery@aelium.test',
      );
      expect(listing.total).toBe(1);
      expect(listing.items[0].id).toBe(customer.id);
      expect(listing.items[0].ownerId).toBe(member.id);
      expect(listing.items[0].ownerLoginId).toBe(login.id);
    });

    it('searchCustomersByEmail con email inexistente devuelve listing vacío (no 404)', async () => {
      const listing = await client.searchCustomersByEmail(
        MASTER,
        'inexistente@aelium.test',
      );
      expect(listing.total).toBe(0);
      expect(listing.items).toEqual([]);
    });
  });

  // ─── SSO 2-call OTP flow ────────────────────────────────────────────────

  describe('SSO 2-call OTP (ADR-083 §4 decisión 13)', () => {
    it('GET /orgs/{cust}/members/{owner}/sso devuelve OTP URL string', async () => {
      const customer = await client.createCustomer(MASTER, { name: 'SSO' });
      const login = await client.createLogin(customer.id, {
        email: 'sso@aelium.test',
        password: 'uuid',
        name: 'SSO',
      });
      const member = await client.addMember(customer.id, {
        loginId: login.id,
        roles: ['Owner'],
      });
      await client.setOwner(customer.id, { memberId: member.id });

      const otpUrl = await client.getMemberSsoOtpUrl(customer.id, member.id);
      expect(otpUrl).toMatch(
        /^http:\/\/mock-panel\.aelium\.test\/login\/sessions\/sso\?otp=/,
      );
      expect(otpUrl.split('=')[1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('cada llamada devuelve OTP DIFERENTE (no se cachea)', async () => {
      const customer = await client.createCustomer(MASTER, { name: 'NoCache' });
      const login = await client.createLogin(customer.id, {
        email: 'no-cache@aelium.test',
        password: 'uuid',
        name: 'NoCache',
      });
      const member = await client.addMember(customer.id, {
        loginId: login.id,
        roles: ['Owner'],
      });

      const otp1 = await client.getMemberSsoOtpUrl(customer.id, member.id);
      const otp2 = await client.getMemberSsoOtpUrl(customer.id, member.id);
      expect(otp1).not.toBe(otp2);
    });
  });

  // ─── DNS zone + records CRUD ────────────────────────────────────────────

  describe('DNS zone & records (ADR-083 §5 decisión 19)', () => {
    it('CRUD completo: zone GET → record POST → PATCH → DELETE → verify', async () => {
      // Setup: provisión mínima customer + website.
      const customer = await client.createCustomer(MASTER, { name: 'DNSTest' });
      const ws = await client.createWebsite(customer.id, {
        domain: 'dns-test.es',
      });

      // GET zone (creada automáticamente al crear website).
      const zone = await client.getDnsZone(customer.id, ws.id, 'dns-test.es');
      expect(zone.origin).toBe('dns-test.es');
      expect(zone.soa.nameServer).toBe('ns1.aelium.net');

      // POST record A.
      const created = await client.addDnsRecord(
        customer.id,
        ws.id,
        'dns-test.es',
        {
          kind: 'A',
          name: 'shop',
          value: '203.0.113.5',
          ttl: 3600,
        },
      );
      expect(created.id).toBeTruthy();

      // GET zone refresh — record presente.
      const zone2 = await client.getDnsZone(customer.id, ws.id, 'dns-test.es');
      const newRec = zone2.records.find((r) => r.id === created.id);
      expect(newRec).toBeDefined();
      expect(newRec?.kind).toBe('A');
      expect(newRec?.value).toBe('203.0.113.5');

      // PATCH record (cambiar TTL).
      await client.updateDnsRecord(
        customer.id,
        ws.id,
        'dns-test.es',
        created.id,
        { ttl: 600 },
      );
      const zone3 = await client.getDnsZone(customer.id, ws.id, 'dns-test.es');
      expect(zone3.records.find((r) => r.id === created.id)?.ttl).toBe(600);

      // DELETE record.
      await client.deleteDnsRecord(
        customer.id,
        ws.id,
        'dns-test.es',
        created.id,
      );
      const zone4 = await client.getDnsZone(customer.id, ws.id, 'dns-test.es');
      expect(zone4.records.find((r) => r.id === created.id)).toBeUndefined();
    });

    it('addDnsRecord con kind inválido → INVALID_PAYLOAD (422)', async () => {
      const customer = await client.createCustomer(MASTER, { name: 'BadKind' });
      const ws = await client.createWebsite(customer.id, {
        domain: 'bad-kind.es',
      });
      await expect(
        client.addDnsRecord(customer.id, ws.id, 'bad-kind.es', {
          // @ts-expect-error — el test invoca shape inválido a propósito.
          kind: 'INVALID',
          name: '@',
          value: 'x',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
        retriable: false,
      });
    });
  });

  // ─── Default DNS records cluster-wide ────────────────────────────────────

  describe('Default DNS records bootstrap (ADR-083 §5 decisión 20)', () => {
    it('CRUD completo: list (vacío) → add → list (1) → patch → delete', async () => {
      // List inicial: vacío (sin seed).
      const initial = await client.listDefaultDnsRecords();
      expect(initial).toEqual([]);

      // Add NS default record.
      const created = await client.addDefaultDnsRecord({
        kind: 'NS',
        name: '@',
        value: 'ns1.aelium.net',
      });
      expect(created.id).toBeTruthy();

      // List devuelve el record creado.
      const afterAdd = await client.listDefaultDnsRecords();
      expect(afterAdd).toHaveLength(1);
      expect(afterAdd[0].kind).toBe('NS');
      expect(afterAdd[0].value).toBe('ns1.aelium.net');

      // PATCH update value (NS-sync C3 → C2 simulada).
      await client.updateDefaultDnsRecord(created.id, {
        value: 'ns1-new.aelium.net',
      });
      const afterPatch = await client.listDefaultDnsRecords();
      expect(afterPatch[0].value).toBe('ns1-new.aelium.net');

      // DELETE.
      await client.deleteDefaultDnsRecord(created.id);
      const afterDelete = await client.listDefaultDnsRecords();
      expect(afterDelete).toEqual([]);
    });

    it('zona nueva HEREDA defaults sembrados (espejo Enhance ADR-082 §5)', async () => {
      // Pre-seed default record A apex.
      await client.addDefaultDnsRecord({
        kind: 'A',
        name: '@',
        value: '203.0.113.10',
      });

      const customer = await client.createCustomer(MASTER, {
        name: 'Heritage',
      });
      const ws = await client.createWebsite(customer.id, {
        domain: 'heritage.es',
      });

      const zone = await client.getDnsZone(customer.id, ws.id, 'heritage.es');
      const apexA = zone.records.find(
        (r) => r.kind === 'A' && r.name === '@' && r.value === '203.0.113.10',
      );
      expect(apexA).toBeDefined();
    });
  });

  // ─── Reconcile reads ────────────────────────────────────────────────────

  describe('Reconcile reads (ADR-083 §6 decisión 24)', () => {
    it('subscription suspendida en mock → reconcile detecta status=deleted', async () => {
      const customer = await client.createCustomer(MASTER, {
        name: 'Reconcile',
      });
      const sub = await client.createSubscription(MASTER, customer.id, {
        planId: 7,
      });

      // Status inicial: active.
      const before = await client.getSubscription(customer.id, sub.id);
      expect(before.status).toBe('active');

      // Operator suspende manualmente desde "panel Enhance" (PATCH).
      await client.patchSubscription(customer.id, sub.id, {
        isSuspended: true,
      });

      // Reconcile read detecta el cambio.
      const after = await client.getSubscription(customer.id, sub.id);
      expect(after.status).toBe('deleted'); // mock map isSuspended=true → status=deleted
    });

    it('subscription missing → reconcile detecta 404 → INVALID_STATE', async () => {
      const customer = await client.createCustomer(MASTER, {
        name: 'Missing',
      });
      const sub = await client.createSubscription(MASTER, customer.id, {
        planId: 7,
      });

      // Operator borra desde panel Enhance.
      await client.deleteSubscription(customer.id, sub.id);

      // Reconcile read post-delete: 404 → INVALID_STATE → reconcile cron
      // emite `service.reconciled_external_change` con `change_type='subscription_missing'`.
      await expect(
        client.getSubscription(customer.id, sub.id),
      ).rejects.toBeInstanceOf(ProvisionerPluginError);
      await expect(
        client.getSubscription(customer.id, sub.id),
      ).rejects.toMatchObject({ code: 'INVALID_STATE', retriable: false });
    });
  });

  // ─── Reset password (Fase E preview) ────────────────────────────────────

  describe('Reset password (ADR-083 §9 decisión 32)', () => {
    it('PUT /v2/logins/{id}/password idempotente con NewPassword', async () => {
      const customer = await client.createCustomer(MASTER, {
        name: 'ResetPwd',
      });
      const login = await client.createLogin(customer.id, {
        email: 'reset@aelium.test',
        password: 'old-pwd',
        name: 'ResetPwd',
      });

      await expect(
        client.resetLoginPassword(login.id, { NewPassword: 'fresh-uuid-pwd' }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Plans (Sprint 15C Fase 15C.E — ADR-083 Amendment A3) ──────────────

  describe('Plans (Fase 15C.E admin-only — alimenta dropdown change_package)', () => {
    it('listPlans contra master org devuelve fixture canónico (3 planes)', async () => {
      const result = await client.listPlans(MASTER);
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.items.map((p) => p.name)).toEqual([
        'Web Starter',
        'Web Pro',
        'Web Premium',
      ]);
      expect(result.items[0].id).toBe(1);
      expect(result.items[2].planType).toBe('dedicated');
    });

    it('listPlans contra org inexistente → PROVIDER error 404 → INVALID_STATE', async () => {
      await expect(
        client.listPlans('00000000-0000-0000-0000-000000000999'),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });
  });

  // ─── Mock state introspection (defensive testing) ───────────────────────

  describe('Domains / SSL (Sprint 15C.II Fase F.7 — ADR-083 A8)', () => {
    it('al crear website, el mock auto-siembra cert LE → getDomainSsl devuelve el cert', async () => {
      mock.reset();
      const customer = await client.createCustomer(MASTER, {
        name: 'ACME SSL Test',
      });
      const sub = await client.createSubscription(MASTER, customer.id, {
        planId: 7,
      });
      const ws = await client.createWebsite(customer.id, {
        domain: 'ssl-test.aelium.test',
        subscriptionId: sub.id,
      });
      const wsFresh = await client.getWebsite(customer.id, ws.id);

      const cert = await client.getDomainSsl(wsFresh.domain.id);
      expect(cert).not.toBeNull();
      expect(cert!.cn).toBe('ssl-test.aelium.test');
      expect(cert!.issuer).toBe("Let's Encrypt Authority X3");
      expect(cert!.forceHttps).toBe(true);
      // expires debe parsear como Date válida.
      expect(Number.isFinite(new Date(cert!.expires).getTime())).toBe(true);
    });

    it('getDomainSsl devuelve null si el domainId no tiene cert (404)', async () => {
      const unknownDomainId = '99999999-9999-9999-9999-999999999999';
      const cert = await client.getDomainSsl(unknownDomainId);
      expect(cert).toBeNull();
    });

    it('seed.domainSsls pre-siembra cert custom (issuer non-LE)', async () => {
      const seededDomainId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const mockWithSeed = await startMockEnhanceServer({
        seed: {
          apiToken: 'integration-token-fixture',
          masterOrgId: MASTER,
          domainSsls: {
            [seededDomainId]: {
              cn: 'seeded.aelium.test',
              expires: '2026-09-01T00:00:00Z',
              issued: '2026-06-03T00:00:00Z',
              issuer: 'DigiCert SHA2 Secure Server CA',
              forceHttps: false,
            },
          },
        },
      });
      try {
        const seededClient = new EnhanceApiClient({
          baseUrl: mockWithSeed.baseUrl,
          apiToken: 'integration-token-fixture',
        });
        const cert = await seededClient.getDomainSsl(seededDomainId);
        expect(cert).toEqual({
          cn: 'seeded.aelium.test',
          expires: '2026-09-01T00:00:00Z',
          issued: '2026-06-03T00:00:00Z',
          issuer: 'DigiCert SHA2 Secure Server CA',
          forceHttps: false,
        });
      } finally {
        await mockWithSeed.stop();
      }
    });
  });

  describe('Mock state introspection', () => {
    it('requestLog acumula todas las requests del test', async () => {
      mock.state.requestLog.length = 0; // limpia para aserción precisa
      await client.getVersion();
      await client.getOrg(MASTER);

      const versionReq = mock.state.requestLog.find(
        (r) => r.path === '/version',
      );
      const orgReq = mock.state.requestLog.find(
        (r) => r.path === `/orgs/${MASTER}`,
      );
      expect(versionReq).toBeDefined();
      expect(versionReq?.method).toBe('GET');
      expect(orgReq).toBeDefined();
      expect(orgReq?.method).toBe('GET');
    });

    it('reset() limpia state pero el server sigue vivo', async () => {
      await client.createCustomer(MASTER, { name: 'PreReset' });
      expect(mock.state.orgs.size).toBe(2); // master + 1 customer

      mock.reset();
      expect(mock.state.orgs.size).toBe(1); // solo master

      // Server sigue vivo.
      const v = await client.getVersion();
      expect(v).toBe('12.21.3');
    });
  });
});

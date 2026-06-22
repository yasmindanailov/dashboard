/**
 * Sprint 15D Fase 15D.C — tests de integración cliente RC ↔ MockResellerClubServer.
 *
 * Verifica el cliente high-level contra el stub Express end-to-end (HTTP real
 * sobre puerto efímero), cubriendo happy paths + las rutas de error modeladas
 * con alta fidelidad (ADR-081 §10/§11, lección L20). CI usa SIEMPRE el mock,
 * nunca OT&E live (ADR-081 §11).
 */

import { ProvisionerPluginError } from '../../../../core/provisioning/types';
import { startMockResellerClubServer } from '../../../../../test/mocks/resellerclub-server';

import { ResellerClubApiClient } from './client';
import { RcRegisterInput } from './types';

const AUTH = { authUserId: 'uid-fixture', apiKey: 'key-fixture' };

describe('ResellerClubApiClient ↔ MockResellerClubServer — Sprint 15D Fase 15D.C', () => {
  let mock: Awaited<ReturnType<typeof startMockResellerClubServer>>;
  let client: ResellerClubApiClient;

  beforeAll(async () => {
    mock = await startMockResellerClubServer({ seed: { ...AUTH } });
  });

  afterAll(async () => {
    await mock.stop();
  });

  beforeEach(() => {
    mock.reset();
    client = new ResellerClubApiClient({ baseUrl: mock.baseUrl, ...AUTH });
  });

  function registerInput(
    overrides: Partial<RcRegisterInput> = {},
  ): RcRegisterInput {
    return {
      'domain-name': 'aeliumtest.com',
      years: 1,
      ns: ['ns1.aelium.net', 'ns2.aelium.net'],
      'customer-id': '1',
      'reg-contact-id': '1',
      'admin-contact-id': '1',
      'tech-contact-id': '1',
      'billing-contact-id': '1',
      'invoice-option': 'NoInvoice',
      'protect-privacy': true,
      ...overrides,
    };
  }

  // ─── Pre-venta ──────────────────────────────────────────────────────────────

  it('checkAvailability: disponible vs no disponible', async () => {
    const res = await client.checkAvailability('aeliumtest', ['com', 'net']);
    expect(res['aeliumtest.com']).toEqual({
      classkey: 'domcno',
      status: 'available',
    });
    expect(res['aeliumtest.net'].status).toBe('available');

    const taken = await client.checkAvailability('google', ['com']);
    expect(taken['google.com'].status).toBe('regthroughothers');
  });

  it('getResellerPrice: COSTE como string bajo el slab "0" por classkey', async () => {
    const res = await client.getResellerPrice();
    expect(res.domcno['0']?.pricing.addnewdomain?.['1']).toBe('8.00');
    expect(typeof res.domcno['privacy-protection']).toBe('string');
  });

  it('getCustomerPrice: precio sugerido como number por años', async () => {
    const res = await client.getCustomerPrice();
    expect(res.domcno.addnewdomain?.['1']).toBe(11.99);
    expect(res.domcno.renewdomain?.['10']).toBe(11.99);
  });

  // ─── Customer + contact lazy ────────────────────────────────────────────────

  it('searchCustomerByEmail null → signup → search devuelve el id', async () => {
    expect(await client.searchCustomerByEmail('lazy@aelium.test')).toBeNull();
    const id = await client.signupCustomer({
      username: 'lazy@aelium.test',
      passwd: 'x',
      name: 'Lazy',
      company: 'C',
      'address-line-1': 'l1',
      city: 'M',
      state: 'M',
      country: 'ES',
      zipcode: '28001',
      'phone-cc': '34',
      phone: '600000000',
    });
    expect(id).toMatch(/^\d+$/);
    expect(await client.searchCustomerByEmail('lazy@aelium.test')).toBe(id);
  });

  it('addContact .es sin NIF → REGISTRANT_INELIGIBLE; con NIF → ok', async () => {
    const base = {
      name: 'A',
      company: 'C',
      email: 'a@aelium.test',
      'address-line-1': 'l1',
      city: 'M',
      state: 'M',
      country: 'ES',
      zipcode: '28001',
      'phone-cc': '34',
      phone: '600000000',
      'customer-id': '1',
    } as const;

    await expectError(
      client.addContact({ ...base, type: 'EsContact' }),
      'REGISTRANT_INELIGIBLE',
    );

    const id = await client.addContact({
      ...base,
      type: 'EsContact',
      'attr-name': ['es_tipo_identificacion', 'es_identificacion'],
      'attr-value': ['1', '12345678Z'],
    });
    expect(id).toMatch(/^\d+$/);
  });

  // ─── Ciclo de vida (happy path que OT&E no pudo dar) ────────────────────────

  it('register → details (status active, ns, endtime) → register dup = DOMAIN_UNAVAILABLE', async () => {
    const orderId = await client.registerDomain(registerInput());
    expect(orderId).toMatch(/^\d+$/);

    const details = await client.getDomainDetailsByName('aeliumtest.com');
    expect(details.entitystatus).toBe('Active');
    expect(details.ns1).toBe('ns1.aelium.net');
    expect(Number(details.endtime)).toBeGreaterThan(0);

    await expectError(
      client.registerDomain(registerInput()),
      'DOMAIN_UNAVAILABLE',
    );
  });

  it('register premium → DOMAIN_PREMIUM', async () => {
    await client.searchDomains(); // sanity
    await fetch(`${mock.baseUrl}/__test__/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ premiumDomains: ['premiumsld'] }),
    });
    await expectError(
      client.registerDomain(registerInput({ 'domain-name': 'premiumsld.com' })),
      'DOMAIN_PREMIUM',
    );
  });

  it('renew avanza el endtime (DOM-INV-4 verificable)', async () => {
    const orderId = await client.registerDomain(registerInput());
    const before = await client.getDomainDetailsByOrderId(orderId);
    await client.renewDomain({
      'order-id': orderId,
      years: 1,
      'exp-date': Number(before.endtime),
      'invoice-option': 'NoInvoice',
    });
    const after = await client.getDomainDetailsByOrderId(orderId);
    expect(Number(after.endtime)).toBeGreaterThan(Number(before.endtime));
  });

  // ─── Gestión + admin ────────────────────────────────────────────────────────

  it('modifyNameservers + modifyPrivacyProtection se reflejan en details', async () => {
    const orderId = await client.registerDomain(registerInput());
    await client.modifyNameservers(orderId, [
      'ns3.aelium.net',
      'ns4.aelium.net',
    ]);
    await client.modifyPrivacyProtection(orderId, false, 'cliente lo pidió');
    const d = await client.getDomainDetailsByOrderId(orderId);
    expect(d.ns1).toBe('ns3.aelium.net');
    expect(d.isprivacyprotected).toBe(false);
  });

  it('enable/disableTheftProtection se reflejan en currentstatus (read-after-write — 15D.F)', async () => {
    const orderId = await client.registerDomain(registerInput());
    expect(
      (await client.getDomainDetailsByOrderId(orderId)).currentstatus,
    ).toBe('ok');
    await client.enableTheftProtection(orderId);
    expect(
      (await client.getDomainDetailsByOrderId(orderId)).currentstatus,
    ).toBe('transferlock');
    await client.disableTheftProtection(orderId);
    expect(
      (await client.getDomainDetailsByOrderId(orderId)).currentstatus,
    ).toBe('ok');
  });

  it('modifyContacts refleja los 4 handles en details (read-after-write — 15D.F)', async () => {
    const orderId = await client.registerDomain(registerInput());
    await client.modifyContacts(orderId, {
      'reg-contact-id': '11',
      'admin-contact-id': '22',
      'tech-contact-id': '33',
      'billing-contact-id': '44',
    });
    const d = await client.getDomainDetailsByOrderId(orderId);
    expect(d.registrantcontactid).toBe('11');
    expect(d.admincontactid).toBe('22');
    expect(d.techcontactid).toBe('33');
    expect(d.billingcontactid).toBe('44');
  });

  it('details expone domsecret (auth-code) y modifyAuthCode round-trip-ea (15D.F)', async () => {
    const orderId = await client.registerDomain(registerInput());
    const seeded = await client.getDomainDetailsByOrderId(orderId);
    expect(seeded.domsecret).toBe(`Auth-${orderId}`);
    await client.modifyAuthCode(orderId, 'NewEpp123!');
    expect((await client.getDomainDetailsByOrderId(orderId)).domsecret).toBe(
      'NewEpp123!',
    );
  });

  it('suspend/unsuspend cambian entitystatus', async () => {
    const orderId = await client.registerDomain(registerInput());
    await client.suspendOrder(orderId, 'impago');
    expect((await client.getDomainDetailsByOrderId(orderId)).entitystatus).toBe(
      'Suspended',
    );
    await client.unsuspendOrder(orderId);
    expect((await client.getDomainDetailsByOrderId(orderId)).entitystatus).toBe(
      'Active',
    );
  });

  it('searchDomains refleja los dominios registrados', async () => {
    expect((await client.searchDomains()).recsindb).toBe('0');
    await client.registerDomain(registerInput());
    expect((await client.searchDomains()).recsindb).toBe('1');
  });

  // ─── Errores ────────────────────────────────────────────────────────────────

  it('getDomainDetailsByName de dominio inexistente lanza error', async () => {
    await expect(
      client.getDomainDetailsByName('noexiste.com'),
    ).rejects.toBeInstanceOf(ProvisionerPluginError);
  });

  it('api-key inválida → PROVIDER_AUTH_FAILED', async () => {
    const bad = new ResellerClubApiClient({
      baseUrl: mock.baseUrl,
      authUserId: 'uid-fixture',
      apiKey: 'WRONG',
    });
    await expectError(
      bad.checkAvailability('x', ['com']),
      'PROVIDER_AUTH_FAILED',
    );
  });
});

async function expectError(
  promise: Promise<unknown>,
  code: ProvisionerPluginError['code'],
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ProvisionerPluginError);
  await promise.catch((err: unknown) => {
    expect((err as ProvisionerPluginError).code).toBe(code);
  });
}

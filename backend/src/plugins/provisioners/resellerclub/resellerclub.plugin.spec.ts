/**
 * Sprint 15D Fase 15D.D — tests unit `ResellerclubProvisionerPlugin`.
 *
 * Commit 4 — `provision(register)` + DOM-INV-1:
 *   - happy path: available → ensureRegistrant + domains/register.
 *   - DOM-INV-1 adopción: regthroughus → adopta order-id, NO re-registra.
 *   - DOMAIN_UNAVAILABLE: regthroughothers.
 *   - reintento idempotente: provider_reference ya persistido → no toca RC.
 *   - INVALID_PAYLOAD: falta domain_years.
 *   - renew/transfer_in → NOT_IMPLEMENTED (Fase 15D.E / 15D.II).
 *
 * El cliente RC se mockea (jest.spyOn de `getApiClient`); el smoke vertical
 * end-to-end contra `MockResellerClubServer` es el Commit 6.
 */

import { ProvisionContext, ClientPublicData } from '../../../core/provisioning/types';

import { ResellerclubProvisionerPlugin } from './resellerclub.plugin';

describe('ResellerclubProvisionerPlugin.provision(register) — Fase 15D.D', () => {
  const SAMPLE_CLIENT: ClientPublicData = {
    id: 'user-1',
    email: 'carla@aelium.test',
    first_name: 'Carla',
    last_name: 'Pérez',
    company_name: null,
    phone: '600111222',
    locale: 'es',
    country_code: 'ES',
    address_line1: 'Calle Mayor 1',
    address_line2: null,
    city: 'Madrid',
    state: 'Madrid',
    postal_code: '28013',
    tax_id: '12345678Z',
  };

  const REFS = {
    customerId: '700001',
    contacts: {
      registrant: '800001',
      admin: '800001',
      tech: '800001',
      billing: '800001',
    },
  };

  function buildMockClient() {
    return {
      checkAvailability: jest.fn(),
      registerDomain: jest.fn(),
      getDomainDetailsByName: jest.fn(),
    };
  }

  function buildPlugin(
    client: ReturnType<typeof buildMockClient>,
    opts: { ns?: string[] } = {},
  ) {
    const customers = { ensureRegistrant: jest.fn().mockResolvedValue(REFS) };
    const settings = {
      getJson: jest
        .fn()
        .mockResolvedValue(opts.ns ?? ['ns1.aelium.net', 'ns2.aelium.net']),
    };
    const plugin = new ResellerclubProvisionerPlugin(
      null as never,
      null as never,
      customers as never,
      settings as never,
    );
    jest
      .spyOn(plugin, 'getApiClient')
      .mockResolvedValue({ client: client as never, config: {} as never });
    return { plugin, customers, settings };
  }

  function buildCtx(
    overrides: {
      service?: Record<string, unknown>;
      operation?: 'register' | 'renew' | 'transfer_in';
    } = {},
  ): ProvisionContext {
    const service = {
      id: 'svc-1',
      user_id: 'user-1',
      domain: 'example.com',
      provider_reference: null,
      metadata: { domain_operation: 'register', domain_years: 1 },
      ...(overrides.service ?? {}),
    };
    return {
      service: service as never,
      client: SAMPLE_CLIENT,
      productConfig: {},
      serverId: null,
      correlationId: 'cor-1',
      operation: overrides.operation ?? 'register',
    };
  }

  it('happy path: available → ensureRegistrant + domains/register', async () => {
    const client = buildMockClient();
    client.checkAvailability.mockResolvedValue({
      'example.com': { classkey: 'domcno', status: 'available' },
    });
    client.registerDomain.mockResolvedValue('700123');
    const { plugin, customers } = buildPlugin(client);

    const result = await plugin.provision(buildCtx());

    expect(result.providerReference).toBe('700123');
    expect(result.followUp).toEqual(['mark_active']);
    expect(result.metadata).toMatchObject({
      domain_operation: 'register',
      domain_years: 1,
      rc_customer_id: '700001',
      rc_registrant_contact_id: '800001',
      rc_nameservers: 'ns1.aelium.net,ns2.aelium.net',
      whois_privacy: true,
    });
    expect(customers.ensureRegistrant).toHaveBeenCalledTimes(1);
    expect(client.registerDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        'domain-name': 'example.com',
        years: 1,
        ns: ['ns1.aelium.net', 'ns2.aelium.net'],
        'customer-id': '700001',
        'reg-contact-id': '800001',
        'admin-contact-id': '800001',
        'tech-contact-id': '800001',
        'billing-contact-id': '800001',
        'invoice-option': 'NoInvoice',
        'protect-privacy': true,
      }),
    );
  });

  it('DOM-INV-1 adopción: regthroughus → adopta order-id, NO re-registra', async () => {
    const client = buildMockClient();
    client.checkAvailability.mockResolvedValue({
      'example.com': { classkey: 'domcno', status: 'regthroughus' },
    });
    client.getDomainDetailsByName.mockResolvedValue({ orderid: '700999' });
    const { plugin, customers } = buildPlugin(client);

    const result = await plugin.provision(buildCtx());

    expect(result.providerReference).toBe('700999');
    expect(result.followUp).toEqual(['mark_active']);
    expect(client.registerDomain).not.toHaveBeenCalled();
    expect(customers.ensureRegistrant).not.toHaveBeenCalled();
  });

  it('DOMAIN_UNAVAILABLE: regthroughothers → no registra', async () => {
    const client = buildMockClient();
    client.checkAvailability.mockResolvedValue({
      'example.com': { classkey: 'domcno', status: 'regthroughothers' },
    });
    const { plugin, customers } = buildPlugin(client);

    await expect(plugin.provision(buildCtx())).rejects.toMatchObject({
      code: 'DOMAIN_UNAVAILABLE',
      retriable: false,
    });
    expect(client.registerDomain).not.toHaveBeenCalled();
    expect(customers.ensureRegistrant).not.toHaveBeenCalled();
  });

  it('reintento idempotente: provider_reference ya existe → no toca RC', async () => {
    const client = buildMockClient();
    const { plugin } = buildPlugin(client);

    const result = await plugin.provision(
      buildCtx({
        service: {
          provider_reference: '700123',
          metadata: {
            domain_operation: 'register',
            domain_years: 1,
            rc_customer_id: '700001',
          },
        },
      }),
    );

    expect(result.providerReference).toBe('700123');
    expect(result.metadata).toMatchObject({ rc_customer_id: '700001' });
    expect(client.checkAvailability).not.toHaveBeenCalled();
    expect(client.registerDomain).not.toHaveBeenCalled();
  });

  it('INVALID_PAYLOAD: falta domain_years en metadata', async () => {
    const client = buildMockClient();
    const { plugin } = buildPlugin(client);

    await expect(
      plugin.provision(
        buildCtx({ service: { metadata: { domain_operation: 'register' } } }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD', retriable: false });
    expect(client.checkAvailability).not.toHaveBeenCalled();
  });

  it('renew y transfer_in → NOT_IMPLEMENTED (Fase 15D.E / 15D.II)', async () => {
    const client = buildMockClient();
    const { plugin } = buildPlugin(client);

    await expect(
      plugin.provision(buildCtx({ operation: 'renew' })),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(
      plugin.provision(buildCtx({ operation: 'transfer_in' })),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

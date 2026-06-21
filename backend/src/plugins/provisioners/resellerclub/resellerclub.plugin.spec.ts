/**
 * Sprint 15D Fase 15D.D — tests unit `ResellerclubProvisionerPlugin`.
 *
 * Commit 4 — `provision(register)` + DOM-INV-1:
 *   - happy path: available → ensureRegistrant + domains/register.
 *   - DOM-INV-1 adopción: regthroughus → adopta order-id, NO re-registra.
 *   - DOMAIN_UNAVAILABLE: regthroughothers.
 *   - reintento idempotente: provider_reference ya persistido → no toca RC.
 *   - INVALID_PAYLOAD: falta domain_years.
 *   - transfer_in → NOT_IMPLEMENTED (Fase 15D.II).
 *
 * Fase 15D.E — `provision(renew)` + DOM-INV-4 (segundo describe):
 *   - happy path (+1a, verificado), idempotencia por período (crash-retry),
 *     DOM-INV-4 (renew que no extiende → retriable), redemption, sin ref.
 *
 * El cliente RC se mockea (jest.spyOn de `getApiClient`); el smoke vertical
 * end-to-end contra `MockResellerClubServer` es el Commit 3 de 15D.E.
 */

import {
  ProvisionContext,
  ClientPublicData,
} from '../../../core/provisioning/types';

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

  it('transfer_in → NOT_IMPLEMENTED (Fase 15D.II)', async () => {
    const client = buildMockClient();
    const { plugin } = buildPlugin(client);

    await expect(
      plugin.provision(buildCtx({ operation: 'transfer_in' })),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('ResellerclubProvisionerPlugin.provision(renew) — Fase 15D.E (DOM-INV-4)', () => {
  const YEAR_SECONDS = 365 * 24 * 3600;
  const NOW = Math.floor(Date.now() / 1000);
  const END = NOW + 30 * 24 * 3600; // expira en 30 días (renovación inminente)

  function detailsWithEnd(
    endEpoch: number,
    extra: Record<string, unknown> = {},
  ) {
    return {
      orderid: '700123',
      domainname: 'example.com',
      entitystatus: 'Active',
      currentstatus: 'ok',
      endtime: endEpoch,
      ns1: 'ns1.aelium.net',
      ns2: 'ns2.aelium.net',
      ...extra,
    };
  }

  function buildPlugin() {
    const client = {
      getDomainDetailsByOrderId: jest.fn(),
      renewDomain: jest.fn().mockResolvedValue(undefined),
    };
    const plugin = new ResellerclubProvisionerPlugin(
      null as never,
      null as never,
      null as never,
      null as never,
    );
    jest
      .spyOn(plugin, 'getApiClient')
      .mockResolvedValue({ client: client as never, config: {} as never });
    return { plugin, client };
  }

  function renewCtx(service: Record<string, unknown> = {}): ProvisionContext {
    return {
      service: {
        id: 'svc-1',
        user_id: 'user-1',
        domain: 'example.com',
        provider_reference: '700123',
        billing_cycle: 'annual',
        expires_at: new Date(END * 1000),
        metadata: { domain_operation: 'renew', rc_customer_id: '700001' },
        ...service,
      } as never,
      // provisionRenew no usa ctx.client (lee ctx.service) → cliente mínimo.
      client: {} as never,
      productConfig: {},
      serverId: null,
      correlationId: 'cor-renew',
      operation: 'renew',
    };
  }

  it('happy path: renueva +1a, verifica DOM-INV-4, performed=true', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId
      .mockResolvedValueOnce(detailsWithEnd(END)) // before
      .mockResolvedValueOnce(detailsWithEnd(END + YEAR_SECONDS)); // after

    const result = await plugin.provision(renewCtx());

    expect(client.renewDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        'order-id': '700123',
        years: 1,
        'exp-date': END,
        'invoice-option': 'NoInvoice',
      }),
    );
    expect(result.providerReference).toBe('700123');
    expect(result.followUp).toEqual([]);
    expect(result.metadata).toMatchObject({
      domain_operation: 'renew',
      domain_renew_performed: true,
      rc_customer_id: '700001', // metadata previa preservada
    });
    expect(result.metadata.domain_expires_at).toBe(
      new Date((END + YEAR_SECONDS) * 1000).toISOString(),
    );
  });

  it('idempotente (crash-retry): endtime ya avanzó respecto al ancla → NO re-renueva', async () => {
    const { plugin, client } = buildPlugin();
    // expires_at (ancla) = END; el registrar ya está en END + 1 año (renovado).
    client.getDomainDetailsByOrderId.mockResolvedValueOnce(
      detailsWithEnd(END + YEAR_SECONDS),
    );

    const result = await plugin.provision(
      renewCtx({ expires_at: new Date(END * 1000) }),
    );

    expect(client.renewDomain).not.toHaveBeenCalled();
    expect(result.metadata.domain_renew_performed).toBe(false);
    expect(result.metadata.domain_expires_at).toBe(
      new Date((END + YEAR_SECONDS) * 1000).toISOString(),
    );
  });

  it('DOM-INV-4: renew que no extiende → PROVIDER_INTERNAL_ERROR retriable, sin éxito falso', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId
      .mockResolvedValueOnce(detailsWithEnd(END)) // before
      .mockResolvedValueOnce(detailsWithEnd(END)); // after: NO avanzó

    await expect(plugin.provision(renewCtx())).rejects.toMatchObject({
      code: 'PROVIDER_INTERNAL_ERROR',
      retriable: true,
    });
    expect(client.renewDomain).toHaveBeenCalledTimes(1);
  });

  it('redemption → DOMAIN_IN_REDEMPTION (no retriable), no llama renew', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId.mockResolvedValueOnce(
      detailsWithEnd(NOW - 86400, { currentstatus: 'redemption' }),
    );

    await expect(plugin.provision(renewCtx())).rejects.toMatchObject({
      code: 'DOMAIN_IN_REDEMPTION',
      retriable: false,
    });
    expect(client.renewDomain).not.toHaveBeenCalled();
  });

  it('sin provider_reference → INVALID_STATE', async () => {
    const { plugin, client } = buildPlugin();
    await expect(
      plugin.provision(renewCtx({ provider_reference: null })),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', retriable: false });
    expect(client.getDomainDetailsByOrderId).not.toHaveBeenCalled();
  });

  it('sin ancla (expires_at null, best-effort): renueva y verifica', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId
      .mockResolvedValueOnce(detailsWithEnd(END))
      .mockResolvedValueOnce(detailsWithEnd(END + YEAR_SECONDS));

    const result = await plugin.provision(renewCtx({ expires_at: null }));

    expect(client.renewDomain).toHaveBeenCalledTimes(1);
    expect(result.metadata.domain_renew_performed).toBe(true);
  });
});

describe('ResellerclubProvisionerPlugin getServiceInfo/getStatus/deprovision — Fase 15D.D', () => {
  const FUTURE = Math.floor(Date.now() / 1000) + 365 * 86400;
  const PAST = Math.floor(Date.now() / 1000) - 86400;

  const ACTIVE_DETAILS = {
    orderid: '700123',
    domainname: 'example.com',
    entitystatus: 'Active',
    currentstatus: 'ok',
    endtime: FUTURE,
    ns1: 'ns1.aelium.net',
    ns2: 'ns2.aelium.net',
    isprivacyprotected: true,
    admincontactid: '800001',
    techcontactid: '800001',
    billingcontactid: '800001',
  };

  function buildPlugin() {
    const client = { getDomainDetailsByOrderId: jest.fn() };
    const plugin = new ResellerclubProvisionerPlugin(
      null as never,
      null as never,
      null as never,
      null as never,
    );
    jest
      .spyOn(plugin, 'getApiClient')
      .mockResolvedValue({ client: client as never, config: {} as never });
    return { plugin, client };
  }

  function svc(overrides: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      domain: 'example.com',
      label: 'example.com',
      provider_reference: '700123',
      metadata: {},
      ...overrides,
    } as never;
  }

  it('getServiceInfo activo → status active + DomainInfo poblado (A11)', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId.mockResolvedValue(ACTIVE_DETAILS);

    const info = await plugin.getServiceInfo(svc());

    expect(info.status).toBe('active');
    expect(info.domain).toBeDefined();
    expect(info.domain!.fqdn).toBe('example.com');
    expect(info.domain!.nameservers).toEqual([
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
    expect(info.domain!.lifecycle).toBe('active');
    expect(info.domain!.whoisPrivacy).toBe(true);
    expect(info.domain!.registrarLock).toBe(false);
    expect(info.domain!.authCodeAvailable).toBe(true);
    expect(info.domain!.expiresAt).toBeDefined();
    expect(info.domain!.contacts).toEqual({
      hasAdmin: true,
      hasTech: true,
      hasBilling: true,
    });
    const slugs = info.availableActions.map((a) => a.slug);
    expect(slugs).toContain('modify_nameservers');
    expect(slugs).toContain('suspend_service');
    expect(slugs).not.toContain('unsuspend_service');
  });

  it('getServiceInfo sin provider_reference → unknown, OMITE info.domain', async () => {
    const { plugin, client } = buildPlugin();
    const info = await plugin.getServiceInfo(svc({ provider_reference: null }));
    expect(info.status).toBe('unknown');
    expect(info.domain).toBeUndefined();
    expect(client.getDomainDetailsByOrderId).not.toHaveBeenCalled();
  });

  it('getServiceInfo expirado → status/lifecycle expired', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId.mockResolvedValue({
      ...ACTIVE_DETAILS,
      endtime: PAST,
    });
    const info = await plugin.getServiceInfo(svc());
    expect(info.status).toBe('expired');
    expect(info.domain!.lifecycle).toBe('expired');
  });

  it('getServiceInfo redemption → expired + lifecycle redemption + recoveryHint', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId.mockResolvedValue({
      ...ACTIVE_DETAILS,
      endtime: PAST,
      currentstatus: 'redemption',
    });
    const info = await plugin.getServiceInfo(svc());
    expect(info.status).toBe('expired');
    expect(info.domain!.lifecycle).toBe('redemption');
    expect(info.recoveryHint).toBe('contact_support');
  });

  it('getStatus: activo → active; sin ref → unknown; error → unknown', async () => {
    const { plugin, client } = buildPlugin();
    client.getDomainDetailsByOrderId.mockResolvedValue(ACTIVE_DETAILS);
    expect((await plugin.getStatus(svc())).status).toBe('active');

    const noRef = await plugin.getStatus(svc({ provider_reference: null }));
    expect(noRef.status).toBe('unknown');
    expect(noRef.statusReason).toContain('not_yet_provisioned');

    client.getDomainDetailsByOrderId.mockRejectedValueOnce(new Error('down'));
    expect((await plugin.getStatus(svc())).status).toBe('unknown');
  });

  it('deprovision → no-op (no lanza, no toca RC)', async () => {
    const { plugin, client } = buildPlugin();
    await expect(
      plugin.deprovision({
        service: svc(),
        reason: 'cancelled',
        correlationId: 'c',
      }),
    ).resolves.toBeUndefined();
    expect(client.getDomainDetailsByOrderId).not.toHaveBeenCalled();
  });

  it('getSsoUrl → null (sin panel RC, ADR-070)', async () => {
    const { plugin } = buildPlugin();
    expect(await plugin.getSsoUrl(svc())).toBeNull();
  });
});

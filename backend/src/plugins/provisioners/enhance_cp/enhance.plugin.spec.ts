/**
 * Sprint 15C Fase 15C.C — tests unit `EnhanceProvisionerPlugin`.
 *
 * Cobertura por método del contrato:
 *
 *   provision()
 *     - DH-INV-1/DH-INV-2: rechaza service.domain null/empty/sin-punto.
 *     - extractEnhancePlanId: rechaza productConfig sin enhance_plan_id.
 *     - happy path: ejecuta steps 1-4 vía customers + steps 5-6 vía API +
 *       devuelve metadata canónica + followUp=['mark_active'].
 *     - displayName: company_name > first+last > email.
 *
 *   deprovision()
 *     - sin metadata (no-op idempotente).
 *     - 404 → idempotente OK (ya borrado externamente).
 *     - 401 → re-throw (no se silencia auth fail).
 *
 *   getStatus()
 *     - mapeo Enhance status → ServiceInfoStatus (active/suspended/cancelled).
 *     - 404 → 'unknown' + statusReason.
 *     - sin refs → 'unknown'.
 *
 *   getServiceInfo()
 *     - happy path: subscription + bandwidth + resources → ServiceInfo con métricas.
 *     - subscription 404 → unknown info.
 *     - bandwidth/resources fallan: ServiceInfo sin esas métricas (degradación elegante).
 *     - cancelled: availableActions vacío.
 *
 *   getSsoUrl()
 *     - happy path: usa enhance_owner_member_id cacheado.
 *     - sin mapping → null.
 *     - sin refs → null.
 *
 *   executeAction()
 *     - slug inválido → INVALID_PAYLOAD.
 *     - sin refs → INVALID_STATE.
 *     - reset_account_password: invoca PUT password + devuelve nueva password en data.
 *     - view_disk_usage / view_bandwidth_usage: lecturas read-only.
 *     - list_dns_records: lee zona + devuelve records.
 *     - add/update/delete dns_record: side_effect 'service.dns_modified'.
 *     - change_package: PATCH subscription planId.
 *     - force_resync: calculate-resource-usage + side_effect 'service.metrics_invalidated'.
 *
 *   Static contract:
 *     - capabilities frozen incluyen has_dns_management=true (ADR-077 Amendment A1).
 *     - inlineActions incluyen 9 slugs canónicos (ADR-083 §9 decisión 32).
 *     - manifest declarativo cumple shape JsonSchema7 (ADR-080 §1).
 */

import {
  ProvisionerPluginError,
  ServiceWithRelations,
} from '../../../core/provisioning/types';

import { EnhanceProvisionerPlugin, mapWebsiteStatus } from './enhance.plugin';

describe('EnhanceProvisionerPlugin — Sprint 15C Fase 15C.C', () => {
  const ORG_ID = '00000000-0000-0000-0000-00000000bbbb';
  const SUB_ID = 4242;
  const WEBSITE_ID = '00000000-0000-0000-0000-00000000eeee';
  const LOGIN_ID = '00000000-0000-0000-0000-00000000dddd';
  const MEMBER_ID = '00000000-0000-0000-0000-00000000cccc';
  const USER_ID = '11111111-2222-3333-4444-555555555555';
  const DOMAIN = 'mi-cliente.es';

  // ─── Mocks helpers ──────────────────────────────────────────────────────

  function buildApiMock() {
    return {
      getVersion: jest.fn(),
      getOrg: jest.fn(),
      createCustomer: jest.fn(),
      searchCustomersByEmail: jest.fn(),
      createLogin: jest.fn(),
      resetLoginPassword: jest.fn(),
      addMember: jest.fn(),
      setOwner: jest.fn(),
      getMember: jest.fn(),
      getMemberSsoOtpUrl: jest.fn(),
      createSubscription: jest.fn(),
      getSubscription: jest.fn(),
      patchSubscription: jest.fn(),
      deleteSubscription: jest.fn(),
      getSubscriptionBandwidth: jest.fn(),
      calculateResourceUsage: jest.fn(),
      createWebsite: jest.fn(),
      getWebsite: jest.fn(),
      patchWebsite: jest.fn(),
      deleteWebsite: jest.fn(),
      getDnsZone: jest.fn(),
      addDnsRecord: jest.fn(),
      updateDnsRecord: jest.fn(),
      deleteDnsRecord: jest.fn(),
      listDefaultDnsRecords: jest.fn(),
      addDefaultDnsRecord: jest.fn(),
      updateDefaultDnsRecord: jest.fn(),
      deleteDefaultDnsRecord: jest.fn(),
    };
  }

  function buildPrismaMock(opts: {
    install?: {
      enabled: boolean;
      config: Record<string, unknown>;
      secrets: Record<string, unknown>;
      key_version: number;
      updated_at: Date;
    } | null;
    enhanceCustomer?: {
      user_id: string;
      enhance_org_id: string;
      enhance_owner_login_id: string;
      enhance_owner_member_id: string;
    } | null;
  }) {
    return {
      pluginInstall: {
        findUnique: jest.fn().mockResolvedValue(opts.install ?? null),
      },
      enhanceCustomer: {
        findUnique: jest.fn().mockResolvedValue(opts.enhanceCustomer ?? null),
      },
    };
  }

  const VALID_INSTALL = {
    enabled: true,
    config: {
      baseUrl: 'https://enhance.test',
      masterOrgId: '00000000-0000-0000-0000-00000000aaaa',
    },
    secrets: {
      apiToken: {
        ciphertext: 'fake',
        iv: 'fake',
        tag: 'fake',
        key_version: 1,
      },
    },
    key_version: 1,
    updated_at: new Date('2026-05-08T10:00:00Z'),
  };

  function buildVaultMock(): { decrypt: jest.Mock } {
    return { decrypt: jest.fn().mockReturnValue('decrypted-api-token') };
  }

  function buildCustomersMock(): { ensureCustomer: jest.Mock } {
    return {
      ensureCustomer: jest.fn().mockResolvedValue({
        user_id: USER_ID,
        enhance_org_id: ORG_ID,
        enhance_owner_login_id: LOGIN_ID,
        enhance_owner_member_id: MEMBER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      }),
    };
  }

  function buildPlugin(
    prisma: ReturnType<typeof buildPrismaMock>,
    vault: ReturnType<typeof buildVaultMock>,
    customers: ReturnType<typeof buildCustomersMock>,
    api: ReturnType<typeof buildApiMock>,
  ): EnhanceProvisionerPlugin {
    const plugin = new EnhanceProvisionerPlugin(
      prisma as never,
      vault as never,
      customers as never,
    );
    // Inyectamos un cliente HTTP fake reemplazando getApiClient() — evita
    // construir un EnhanceApiClient real con HTTP mock global. Sprint 15C
    // Fase 15C.D renombró `getApi` → `getApiClient` (público module-internal).
    Object.defineProperty(plugin, 'getApiClient', {
      value: jest.fn().mockResolvedValue({
        client: api,
        config: VALID_INSTALL.config,
      }),
    });
    return plugin;
  }

  function buildContext(
    over: Partial<ServiceWithRelations> = {},
    productConfig: Record<string, unknown> = { enhance_plan_id: 7 },
  ) {
    const service: ServiceWithRelations = {
      id: 'svc-1',
      user_id: USER_ID,
      product_id: 'prod-1',
      status: 'pending' as never,
      label: null,
      domain: DOMAIN,
      server_id: null,
      provisioner_slug: 'enhance_cp',
      provider_reference: null,
      metadata: null,
      ...over,
      client: {
        id: USER_ID,
        email: 'cliente@aelium.test',
        first_name: 'Carla',
        last_name: 'Test',
        company_name: 'ACME Test, S.L.',
        phone: null,
        locale: 'es',
        country_code: 'ES',
      },
      product: {
        id: 'prod-1',
        slug: 'hosting-pro',
        name: 'Hosting Pro',
        type: 'hosting_web',
        provisioner: 'enhance_cp',
        provisioner_config: productConfig,
      },
    } as unknown as ServiceWithRelations;
    return {
      service,
      client: service.client,
      productConfig,
      serverId: null,
      correlationId: 'cor-test',
    };
  }

  function buildServiceWithRefs(
    over: Partial<ServiceWithRelations> = {},
  ): ServiceWithRelations {
    return {
      ...buildContext().service,
      provider_reference: String(SUB_ID),
      metadata: {
        enhance_org_id: ORG_ID,
        enhance_website_id: WEBSITE_ID,
        enhance_subscription_id: String(SUB_ID),
        enhance_plan_id: 7,
        primary_domain: DOMAIN,
      },
      ...over,
    } as ServiceWithRelations;
  }

  // ─── Static contract ────────────────────────────────────────────────────

  describe('Static contract', () => {
    it('declara slug, contractVersion, capabilities, inlineActions, manifest', () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      expect(plugin.slug).toBe('enhance_cp');
      expect(plugin.contractVersion).toBe('v2');
    });

    it('capabilities incluyen has_dns_management=true (ADR-077 Amendment A1)', () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      expect(plugin.capabilities.has_dns_management).toBe(true);
      expect(plugin.capabilities.has_sso_panel).toBe(true);
      expect(plugin.capabilities.has_metrics).toBe(true);
      expect(plugin.capabilities.supports_reconciliation).toBe(true);
      expect(plugin.capabilities.requires_server).toBe(false);
      expect(plugin.capabilities.provision_mode).toBe('sync');
    });

    it('inlineActions incluyen los 9 slugs canónicos (ADR-083 §9 decisión 32)', () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const slugs = plugin.inlineActions.map((a) => a.slug);
      expect(slugs).toEqual(
        expect.arrayContaining([
          'reset_account_password',
          'view_disk_usage',
          'view_bandwidth_usage',
          'list_dns_records',
          'add_dns_record',
          'update_dns_record',
          'delete_dns_record',
          'change_package',
          'force_resync',
        ]),
      );
      expect(slugs).toHaveLength(9);
    });

    it('manifest cumple shape canónico (slug, configSchema required, secretsSchema required)', () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      expect(plugin.manifest.slug).toBe('enhance_cp');
      expect(plugin.manifest.testConnectionMethod).toBe('getStatus');
      expect(plugin.manifest.configSchema.required).toEqual(
        expect.arrayContaining(['baseUrl', 'masterOrgId']),
      );
      expect(plugin.manifest.secretsSchema.required).toEqual(['apiToken']);
    });
  });

  // ─── provision() ────────────────────────────────────────────────────────

  describe('provision()', () => {
    it('rechaza service.domain null/vacío (DH-INV-2 ADR-082 §1)', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const ctx = buildContext({ domain: null });
      await expect(plugin.provision(ctx)).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
        retriable: false,
      });
    });

    it('rechaza service.domain malformado (sin punto)', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const ctx = buildContext({ domain: 'sinpunto' });
      await expect(plugin.provision(ctx)).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
      });
    });

    it('rechaza productConfig sin enhance_plan_id', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const ctx = buildContext({}, {});
      await expect(plugin.provision(ctx)).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
      });
    });

    it('happy path: ejecuta customers.ensureCustomer + createSubscription + createWebsite', async () => {
      const api = buildApiMock();
      api.createSubscription.mockResolvedValueOnce({ id: SUB_ID });
      api.createWebsite.mockResolvedValueOnce({ id: WEBSITE_ID });

      const customers = buildCustomersMock();
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        customers,
        api,
      );

      const ctx = buildContext();
      const result = await plugin.provision(ctx);

      expect(customers.ensureCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: USER_ID,
          email: 'cliente@aelium.test',
          displayName: 'ACME Test, S.L.',
        }),
        api,
        VALID_INSTALL.config.masterOrgId,
      );
      expect(api.createSubscription).toHaveBeenCalledWith(
        VALID_INSTALL.config.masterOrgId,
        ORG_ID,
        { planId: 7 },
      );
      expect(api.createWebsite).toHaveBeenCalledWith(ORG_ID, {
        domain: DOMAIN,
        subscriptionId: SUB_ID,
      });
      expect(result).toEqual({
        providerReference: String(SUB_ID),
        metadata: {
          enhance_website_id: WEBSITE_ID,
          enhance_org_id: ORG_ID,
          enhance_subscription_id: String(SUB_ID),
          enhance_plan_id: 7,
          primary_domain: DOMAIN,
        },
        followUp: ['mark_active'],
      });
    });

    it('displayName cae a "first last" si company_name vacío', async () => {
      const api = buildApiMock();
      api.createSubscription.mockResolvedValueOnce({ id: SUB_ID });
      api.createWebsite.mockResolvedValueOnce({ id: WEBSITE_ID });
      const customers = buildCustomersMock();
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        customers,
        api,
      );

      const ctx = buildContext();
      ctx.service.client.company_name = null;
      ctx.client.company_name = null;
      await plugin.provision(ctx);

      expect(customers.ensureCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Carla Test' }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ─── deprovision() ──────────────────────────────────────────────────────

  describe('deprovision()', () => {
    it('sin metadata: no-op idempotente (no llama a Enhance)', async () => {
      const api = buildApiMock();
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const service = {
        ...buildContext().service,
        metadata: null,
      } as ServiceWithRelations;
      await expect(
        plugin.deprovision({
          service,
          reason: 'cancelled',
          correlationId: 'cor-1',
        }),
      ).resolves.toBeUndefined();
      expect(api.deleteSubscription).not.toHaveBeenCalled();
    });

    it('happy path: llama deleteSubscription con orgId + subscriptionId', async () => {
      const api = buildApiMock();
      api.deleteSubscription.mockResolvedValueOnce(undefined);
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      await plugin.deprovision({
        service: buildServiceWithRefs(),
        reason: 'cancelled',
        correlationId: 'cor-1',
      });
      expect(api.deleteSubscription).toHaveBeenCalledWith(ORG_ID, SUB_ID);
    });

    it('404 INVALID_STATE → idempotente OK (no re-throw)', async () => {
      const api = buildApiMock();
      api.deleteSubscription.mockRejectedValueOnce(
        new ProvisionerPluginError('404', 'INVALID_STATE', false),
      );
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      await expect(
        plugin.deprovision({
          service: buildServiceWithRefs(),
          reason: 'cancelled',
          correlationId: 'cor-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('401 PROVIDER_AUTH_FAILED → re-throw (no se silencia)', async () => {
      const api = buildApiMock();
      api.deleteSubscription.mockRejectedValueOnce(
        new ProvisionerPluginError('401', 'PROVIDER_AUTH_FAILED', false),
      );
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      await expect(
        plugin.deprovision({
          service: buildServiceWithRefs(),
          reason: 'cancelled',
          correlationId: 'cor-1',
        }),
      ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    });
  });

  // ─── getStatus() ────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('sin refs → unknown', async () => {
      const api = buildApiMock();
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const service = {
        ...buildContext().service,
        metadata: null,
      } as ServiceWithRelations;
      const report = await plugin.getStatus(service);
      expect(report.status).toBe('unknown');
      expect(api.getSubscription).not.toHaveBeenCalled();
    });

    it('subscription active sin suspendedBy → status=active', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'active',
        suspendedBy: undefined,
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const report = await plugin.getStatus(buildServiceWithRefs());
      expect(report.status).toBe('active');
      expect(report.statusReason).toBeUndefined();
    });

    it('subscription active CON suspendedBy → status=suspended', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'active',
        suspendedBy: 'admin-uuid',
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const report = await plugin.getStatus(buildServiceWithRefs());
      expect(report.status).toBe('suspended');
      expect(report.statusReason).toContain('admin-uuid');
    });

    it('subscription deleted → status=cancelled', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'deleted',
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const report = await plugin.getStatus(buildServiceWithRefs());
      expect(report.status).toBe('cancelled');
    });

    it('subscription 404 → unknown + statusReason "drift detected"', async () => {
      const api = buildApiMock();
      api.getSubscription.mockRejectedValueOnce(
        new ProvisionerPluginError('404', 'INVALID_STATE', false),
      );
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const report = await plugin.getStatus(buildServiceWithRefs());
      expect(report.status).toBe('unknown');
      expect(report.statusReason).toContain('drift');
    });
  });

  // ─── getServiceInfo() ───────────────────────────────────────────────────

  describe('getServiceInfo()', () => {
    it('happy path: subscription + bandwidth + resources → ServiceInfo con métricas', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getSubscriptionBandwidth.mockResolvedValueOnce({ usedMb: 2048 });
      api.calculateResourceUsage.mockResolvedValueOnce({
        items: [
          { name: 'disk', total: 10000, usage: 2500 },
          { name: 'emailAccounts', total: 50, usage: 3 },
          { name: 'databases', total: 10, usage: 1 },
        ],
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const info = await plugin.getServiceInfo(buildServiceWithRefs());

      expect(info.status).toBe('active');
      expect(info.display.primary).toBe(DOMAIN);
      expect(info.display.secondary).toBe('Web Pro');
      expect(info.metrics?.bandwidthUsedMb).toBe(2048);
      expect(info.metrics?.diskUsedMb).toBe(2500);
      expect(info.metrics?.diskTotalMb).toBe(10000);
      expect(info.metrics?.emailAccountsUsed).toBe(3);
      expect(info.metrics?.databasesUsed).toBe(1);
      expect(info.capabilities.hasSsoPanel).toBe(true);
      expect(info.availableActions.length).toBe(9); // status=active → todas
    });

    it('subscription 404 → unknown info', async () => {
      const api = buildApiMock();
      api.getSubscription.mockRejectedValueOnce(
        new ProvisionerPluginError('404', 'INVALID_STATE', false),
      );
      api.getSubscriptionBandwidth.mockRejectedValueOnce(new Error('any'));
      api.calculateResourceUsage.mockRejectedValueOnce(new Error('any'));
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.status).toBe('unknown');
      expect(info.statusReason).toContain('drift');
    });

    it('cancelled: availableActions vacío (no hay acciones útiles)', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'deleted',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getSubscriptionBandwidth.mockResolvedValueOnce(null);
      api.calculateResourceUsage.mockResolvedValueOnce(null);
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.status).toBe('cancelled');
      expect(info.availableActions).toEqual([]);
    });

    it('bandwidth/resources fallan: ServiceInfo sin esas métricas (degradación elegante)', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getSubscriptionBandwidth.mockRejectedValueOnce(new Error('boom'));
      api.calculateResourceUsage.mockRejectedValueOnce(new Error('boom'));
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.status).toBe('active');
      expect(info.metrics).toBeUndefined();
    });
  });

  // ─── getSsoUrl() ────────────────────────────────────────────────────────

  describe('getSsoUrl()', () => {
    it('happy path: usa enhance_owner_member_id cacheado', async () => {
      const api = buildApiMock();
      api.getMemberSsoOtpUrl.mockResolvedValueOnce(
        'https://panel.test/login/sessions/sso?otp=abc',
      );
      const plugin = buildPlugin(
        buildPrismaMock({
          install: VALID_INSTALL,
          enhanceCustomer: {
            user_id: USER_ID,
            enhance_org_id: ORG_ID,
            enhance_owner_login_id: LOGIN_ID,
            enhance_owner_member_id: MEMBER_ID,
          },
        }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const sso = await plugin.getSsoUrl(buildServiceWithRefs());
      expect(sso?.url).toBe('https://panel.test/login/sessions/sso?otp=abc');
      expect(sso?.opensIn).toBe('new_tab');
      expect(api.getMemberSsoOtpUrl).toHaveBeenCalledWith(ORG_ID, MEMBER_ID);
    });

    it('sin enhance_customers mapping → null + warn', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL, enhanceCustomer: null }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const sso = await plugin.getSsoUrl(buildServiceWithRefs());
      expect(sso).toBeNull();
    });

    it('sin refs en metadata → null', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const service = {
        ...buildContext().service,
        metadata: null,
      } as ServiceWithRelations;
      const sso = await plugin.getSsoUrl(service);
      expect(sso).toBeNull();
    });
  });

  // ─── executeAction() ────────────────────────────────────────────────────

  describe('executeAction()', () => {
    it('slug inválido → INVALID_PAYLOAD', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      await expect(
        plugin.executeAction(buildServiceWithRefs(), 'unknown_slug', {}),
      ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    });

    it('sin refs → INVALID_STATE', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const service = {
        ...buildContext().service,
        metadata: null,
      } as ServiceWithRelations;
      await expect(
        plugin.executeAction(service, 'view_disk_usage', {}),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('reset_account_password: PUT password + devuelve nueva password en data', async () => {
      const api = buildApiMock();
      api.resetLoginPassword.mockResolvedValueOnce(undefined);
      const plugin = buildPlugin(
        buildPrismaMock({
          install: VALID_INSTALL,
          enhanceCustomer: {
            user_id: USER_ID,
            enhance_org_id: ORG_ID,
            enhance_owner_login_id: LOGIN_ID,
            enhance_owner_member_id: MEMBER_ID,
          },
        }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'reset_account_password',
        {},
      );
      expect(result.success).toBe(true);
      expect(result.data?.password).toMatch(/^[0-9a-f]{32}$/);
      expect(api.resetLoginPassword).toHaveBeenCalledWith(LOGIN_ID, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest stringMatching returns any
        NewPassword: expect.stringMatching(/^[0-9a-f]{32}$/),
      });
      expect(result.sideEffects).toEqual(['service.password_reset']);
    });

    it('view_bandwidth_usage: read-only sin side effects', async () => {
      const api = buildApiMock();
      api.getSubscriptionBandwidth.mockResolvedValueOnce({ usedMb: 500 });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'view_bandwidth_usage',
        {},
      );
      expect(result.success).toBe(true);
      expect(result.data?.bandwidth).toEqual({ usedMb: 500 });
      expect(result.sideEffects).toBeUndefined();
    });

    it('list_dns_records: lee zona + devuelve records', async () => {
      const api = buildApiMock();
      api.getDnsZone.mockResolvedValueOnce({
        origin: DOMAIN,
        soa: {
          adminEmail: 'h@aelium.net',
          nameServer: 'ns1.aelium.net',
          expire: 1,
          refresh: 1,
          retry: 1,
          ttl: 1,
        },
        records: [
          { id: 'rec-1', kind: 'A', name: '@', value: '1.2.3.4', proxy: false },
        ],
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'list_dns_records',
        {},
      );
      expect(result.success).toBe(true);
      const data = result.data as { zone: { records: unknown[] } };
      expect(data.zone.records).toHaveLength(1);
      expect(api.getDnsZone).toHaveBeenCalledWith(ORG_ID, WEBSITE_ID, DOMAIN);
    });

    it('add_dns_record: side_effect service.dns_modified', async () => {
      const api = buildApiMock();
      api.addDnsRecord.mockResolvedValueOnce({ id: 'rec-new' });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'add_dns_record',
        { kind: 'A', name: 'shop', value: '203.0.113.5' },
      );
      expect(result.success).toBe(true);
      expect(result.sideEffects).toEqual(['service.dns_modified']);
      expect(api.addDnsRecord).toHaveBeenCalledWith(
        ORG_ID,
        WEBSITE_ID,
        DOMAIN,
        {
          kind: 'A',
          name: 'shop',
          value: '203.0.113.5',
          ttl: undefined,
          proxy: undefined,
        },
      );
    });

    it('update_dns_record: solo pasa los campos definidos', async () => {
      const api = buildApiMock();
      api.updateDnsRecord.mockResolvedValueOnce(undefined);
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'update_dns_record',
        { recordId: 'rec-1', ttl: 600 },
      );
      expect(result.success).toBe(true);
      expect(api.updateDnsRecord).toHaveBeenCalledWith(
        ORG_ID,
        WEBSITE_ID,
        DOMAIN,
        'rec-1',
        { ttl: 600 },
      );
    });

    it('delete_dns_record: side_effect service.dns_modified', async () => {
      const api = buildApiMock();
      api.deleteDnsRecord.mockResolvedValueOnce(undefined);
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'delete_dns_record',
        { recordId: 'rec-1' },
      );
      expect(result.success).toBe(true);
      expect(result.sideEffects).toEqual(['service.dns_modified']);
      expect(api.deleteDnsRecord).toHaveBeenCalledWith(
        ORG_ID,
        WEBSITE_ID,
        DOMAIN,
        'rec-1',
      );
    });

    it('change_package: PATCH subscription planId', async () => {
      const api = buildApiMock();
      api.patchSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        planId: 99,
        planName: 'plan-99',
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'change_package',
        { planId: 99 },
      );
      expect(result.success).toBe(true);
      expect(api.patchSubscription).toHaveBeenCalledWith(ORG_ID, SUB_ID, {
        planId: 99,
      });
    });

    it('force_resync: side_effect service.metrics_invalidated', async () => {
      const api = buildApiMock();
      api.calculateResourceUsage.mockResolvedValueOnce({ items: [] });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'force_resync',
        {},
      );
      expect(result.success).toBe(true);
      expect(result.sideEffects).toEqual(['service.metrics_invalidated']);
    });
  });

  // ─── mapWebsiteStatus helper ────────────────────────────────────────────

  describe('mapWebsiteStatus', () => {
    it.each([
      ['active', 'active'],
      ['suspended', 'suspended'],
      ['creating', 'pending'],
      ['failed', 'failed'],
      ['deleting', 'cancelled'],
      ['deleted', 'cancelled'],
    ] as const)('mapea %s → %s', (input, expected) => {
      expect(mapWebsiteStatus(input as never)).toBe(expected);
    });
  });
});

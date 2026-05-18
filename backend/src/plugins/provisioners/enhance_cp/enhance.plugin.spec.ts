/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
// `unbound-method` + `no-unsafe-*` producen falsos positivos en specs Jest
// cuando se hace `expect(mock.method).toHaveBeenCalled()` o se accede
// `mock.calls[0][0]` para introspección. Doctrina oficial TS-ESLint para
// specs: deshabilitar a nivel de archivo. Solo aplica a este `.spec.ts`.

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
 *     - (Sprint 15C.II Fase B: view_disk_usage / view_bandwidth_usage eliminadas
 *       — métricas vía MetricsBar refresh button + ADR-083 Amendment A4.1)
 *     - list_dns_records: lee zona + devuelve records.
 *     - add/update/delete dns_record: side_effect 'service.dns_modified'.
 *     - change_package: PATCH subscription planId.
 *     - recalculate_provider_metrics (antes force_resync, Amendment A5.1):
 *       PUT calculate-resource-usage + side_effect 'service.metrics_invalidated'.
 *
 *   Static contract:
 *     - capabilities frozen incluyen has_dns_management=true (ADR-077 Amendment A1).
 *     - inlineActions incluyen 9 slugs canónicos (ADR-083 §9 decisión 32).
 *     - manifest declarativo cumple shape JsonSchema7 (ADR-080 §1).
 */

import { executeActionWithCacheInvalidation } from '../../../core/provisioning/plugin-utils';
import type { ProvisioningCacheService } from '../../../core/provisioning/provisioning-cache.service';
import {
  ProvisionerPluginError,
  ServiceWithRelations,
} from '../../../core/provisioning/types';

import {
  EnhanceProvisionerPlugin,
  SSL_EXPIRING_SOON_MS,
  detectAutoRenew,
  mapWebsiteStatus,
  parseEnhanceCertDate,
} from './enhance.plugin';

import type { EventEmitter2 } from '@nestjs/event-emitter';

describe('EnhanceProvisionerPlugin — Sprint 15C Fase 15C.C', () => {
  const ORG_ID = '00000000-0000-0000-0000-00000000bbbb';
  const SUB_ID = 4242;
  const WEBSITE_ID = '00000000-0000-0000-0000-00000000eeee';
  // Sprint 15C.II Fase F.7 — domain.id (UUID interno del EnhanceWebsiteDomain).
  const DOMAIN_ID = '00000000-0000-0000-0000-00000000ffff';
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
      listPlans: jest.fn(), // Sprint 15C Fase 15C.E — ADR-083 Amendment A3
      createWebsite: jest.fn(),
      // Sprint 15C.II Fase F.7: defaults resolved-null para los métodos que
      // ahora participan en el Promise.all de getServiceInfo() — el .catch
      // sobre un jest.fn() no-mockeado rompe (devuelve `undefined`, no Promise).
      // Los tests específicos sobreescriben con mockResolvedValueOnce.
      getWebsite: jest.fn().mockResolvedValue(null),
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
      // Sprint 15C.II Fase F.7 — ADR-083 A8 (getDomainSsl)
      // Default null = "sin cert" (mismo criterio que getWebsite arriba).
      getDomainSsl: jest.fn().mockResolvedValue(null),
      // Sprint 15C.II Fase F.10 — ADR-083 A9 (Apps CMS instaladas).
      // Defaults: null (resolved-null) para getWebsiteApps — equivalente a
      // "website sin apps" → getServiceInfo omite info.apps (capability-driven
      // por presencia). Tests específicos sobreescriben.
      getWebsiteApps: jest.fn().mockResolvedValue(null),
      getWordpressInfo: jest.fn(),
      getDefaultWpSsoUser: jest.fn().mockResolvedValue(null),
      getWordpressUserSsoUrl: jest.fn(),
      getJoomlaInfo: jest.fn(),
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
      // Sprint 15C Fase 15C.H: `actionChangePackage` actualiza
      // `service.metadata.enhance_plan_id` tras éxito del PATCH a Enhance
      // para evitar plan_divergence false positive en el cron L3.
      service: {
        update: jest.fn().mockResolvedValue({}),
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

    it('capabilities incluyen has_dns_management=true (ADR-077 A1) + supports_suspend=true (ADR-077 A4)', () => {
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
      expect(plugin.capabilities.supports_suspend).toBe(true); // ADR-077 Amendment A4
      expect(plugin.capabilities.requires_server).toBe(false);
      expect(plugin.capabilities.provision_mode).toBe('sync');
    });

    it('inlineActions incluyen los 11 slugs canónicos (ADR-083 §9 + A3 + A4.1 + ADR-077 A4 + Fase F.10 A9)', () => {
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
          'list_dns_records',
          'add_dns_record',
          'update_dns_record',
          'delete_dns_record',
          'change_package',
          'recalculate_provider_metrics',
          'list_available_plans', // ADR-083 Amendment A3
          'suspend_service', // ADR-077 Amendment A4 (Sprint 15C.II Fase F)
          'unsuspend_service', // ADR-077 Amendment A4 (Sprint 15C.II Fase F)
          'open_app_admin', // ADR-077 Amendment A9 (Sprint 15C.II Fase F.10)
        ]),
      );
      expect(slugs).toHaveLength(11);
      // Sprint 15C.II Fase B (ADR-083 Amendment A4.1): view_disk_usage y
      // view_bandwidth_usage eliminados del manifest. Refresh metrics ahora
      // vía botón ↻ en MetricsBar + server action refreshServiceInfoAction.
      expect(slugs).not.toContain('view_disk_usage');
      expect(slugs).not.toContain('view_bandwidth_usage');
    });

    it('5 actions admin-only declaran adminOnly=true (ADR-083 A3 + A4.1 + ADR-077 A4) — open_app_admin NO es admin-only (Fase F.10)', () => {
      // Sprint 15C.II Fase B: view_disk_usage + view_bandwidth_usage eliminados.
      // Fase F (ADR-077 A4): + suspend_service / unsuspend_service (operación
      // administrativa, NUNCA cliente self-service). Quedan 5 admin-only:
      // change_package, recalculate_provider_metrics, list_available_plans,
      // suspend_service, unsuspend_service.
      // Fase F.10 (ADR-077 A9): open_app_admin es CLIENTE self-service
      // (cliente abre admin de SU app) → NO declara adminOnly.
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const adminOnlySlugs = plugin.inlineActions
        .filter((a) => a.adminOnly === true)
        .map((a) => a.slug);
      expect(adminOnlySlugs).toEqual(
        expect.arrayContaining([
          'change_package',
          'recalculate_provider_metrics',
          'list_available_plans',
          'suspend_service',
          'unsuspend_service',
        ]),
      );
      expect(adminOnlySlugs).toHaveLength(5);
      // Las 6 acciones cliente: reset_password + 4 DNS + open_app_admin
      // (Fase F.10). DNS están ocultas en frontend via INTERNAL_HELPER_SLUGS
      // pero siguen siendo client-callable por contrato canónico ADR-077
      // A1.3 si has_dns_management=true.
      const clientSlugs = plugin.inlineActions
        .filter((a) => a.adminOnly !== true)
        .map((a) => a.slug);
      expect(clientSlugs).toEqual(
        expect.arrayContaining([
          'reset_account_password',
          'list_dns_records',
          'add_dns_record',
          'update_dns_record',
          'delete_dns_record',
          'open_app_admin',
        ]),
      );
      expect(clientSlugs).toHaveLength(6);
    });

    it('manifest cumple shape canónico (slug, configSchema required, secretsSchema required)', () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      expect(plugin.manifest.slug).toBe('enhance_cp');
      // Sprint 15C.II Fase F.3 (GAP-15CII-G8): `'custom'` — el getStatus de
      // Enhance requiere un provider_reference real; el test-connection usa
      // `testConnection()` (probe `GET /version` + `GET /orgs/{master}`).
      expect(plugin.manifest.testConnectionMethod).toBe('custom');
      expect(typeof plugin.testConnection).toBe('function');
      expect(plugin.manifest.configSchema.required).toEqual(
        expect.arrayContaining(['baseUrl', 'masterOrgId']),
      );
      expect(plugin.manifest.secretsSchema.required).toEqual(['apiToken']);
    });

    // Sprint 15C.II Fase F.3 (GAP-15CII-G8) — test-connection canónico.
    it('testConnection(): GET /version + GET /orgs/{master} OK → { ok: true }', async () => {
      const api = buildApiMock();
      api.getVersion.mockResolvedValue('12.21.3');
      api.getOrg.mockResolvedValue({ id: 'master-org' });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );

      const result = await plugin.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('12.21.3');
      expect(api.getVersion).toHaveBeenCalledTimes(1);
      expect(api.getOrg).toHaveBeenCalledWith(VALID_INSTALL.config.masterOrgId);
    });

    it('testConnection(): si el probe lanza (token inválido, etc.) → { ok: false } + mensaje', async () => {
      const api = buildApiMock();
      api.getVersion.mockResolvedValue('12.21.3');
      api.getOrg.mockRejectedValue(new Error('401 Unauthorized'));
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );

      const result = await plugin.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('401 Unauthorized');
    });

    // Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B.
    it('manifest.productConfigSchema declara enhance_plan_id integer ≥1 required', () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      const schema = plugin.manifest.productConfigSchema;
      expect(schema).toBeDefined();
      expect(schema?.type).toBe('object');
      expect(schema?.required).toEqual(['enhance_plan_id']);
      expect(schema?.additionalProperties).toBe(false);

      const planIdProp = schema?.properties.enhance_plan_id;
      expect(planIdProp?.type).toBe('integer');
      expect(planIdProp?.minimum).toBe(1);
      expect(planIdProp?.description).toBe(
        'plugin.enhance_cp.product_config.enhance_plan_id',
      );
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
      // Sprint 15C.II Fase B fix-up: statusReason ahora es i18n key
      // (no string literal). El frontend ServiceHeader aplica t().
      expect(report.statusReason).toBe(
        'plugin.enhance_cp.status_reason.subscription_missing',
      );
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
      // status=active → 10 acciones: 8 post Amendment A4.1 + suspend_service
      // (ADR-077 A4) + open_app_admin (ADR-077 A9 Fase F.10). unsuspend_service
      // se filtra (solo aplica si status='suspended').
      expect(info.availableActions.length).toBe(10);
      const slugs = info.availableActions.map((a) => a.slug);
      expect(slugs).toContain('suspend_service');
      expect(slugs).not.toContain('unsuspend_service');
      expect(slugs).toContain('open_app_admin');
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
      // Sprint 15C.II Fase B fix-up: statusReason ahora es i18n key.
      expect(info.statusReason).toBe(
        'plugin.enhance_cp.status_reason.subscription_missing',
      );
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

    // ─── recoveryHint (ADR-077 Amendment A5 + ADR-083 Amendment A5.2) ────
    it('sin refs en metadata → recoveryHint=reprovision (not_yet_provisioned)', async () => {
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        buildApiMock(),
      );
      // service sin enhance_org_id / provider_reference → extractServiceRefs null.
      const info = await plugin.getServiceInfo(buildContext().service);
      expect(info.status).toBe('unknown');
      expect(info.statusReason).toBe(
        'plugin.enhance_cp.status_reason.not_yet_provisioned',
      );
      expect(info.recoveryHint).toBe('reprovision');
    });

    it('subscription 404 → recoveryHint=reprovision (subscription_missing)', async () => {
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
      expect(info.recoveryHint).toBe('reprovision');
    });

    it('plan en Enhance ≠ enhance_plan_id del producto → recoveryHint=reconcile + statusReason=plan_divergence (DH-INV-6: status sigue active)', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        planId: 99, // ≠ product.provisioner_config.enhance_plan_id (7)
        status: 'active',
        planName: 'Web Enterprise',
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
      expect(info.status).toBe('active'); // DH-INV-6: no auto-modificamos status
      expect(info.statusReason).toBe(
        'plugin.enhance_cp.status_reason.plan_divergence',
      );
      expect(info.recoveryHint).toBe('reconcile');
      // El display muestra el plan REAL del proveedor (ground truth).
      expect(info.display.secondary).toBe('Web Enterprise');
    });

    it('plan coincide → sin recoveryHint, sin statusReason', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        planId: 7, // === product.provisioner_config.enhance_plan_id
        status: 'active',
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
      expect(info.recoveryHint).toBeUndefined();
      expect(info.statusReason).toBeUndefined();
    });

    // ─── ssl (ADR-077 Amendment A7 + ADR-083 Amendment A8) ───────────────
    //
    // Helper compartido: setup getServiceInfo() con un cert SSL mockeado.
    // El `getWebsite` se mockea para devolver un website con `domain.id =
    // DOMAIN_ID`; el `getDomainSsl` recibe ese DOMAIN_ID y devuelve el cert
    // o lanza/null según el caso. `now` es inyectable para tests deterministas
    // del threshold (los 14 días son fijos, ADR-077 A7.4).
    function setupSslTest(opts: {
      readonly cert: {
        expires: string;
        issuer: string;
        issued?: string;
        cn?: string;
        forceHttps?: boolean;
      } | null;
      readonly websiteFails?: boolean;
      readonly sslThrows?: Error;
    }) {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        planId: 7,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getSubscriptionBandwidth.mockResolvedValueOnce(null);
      api.calculateResourceUsage.mockResolvedValueOnce(null);
      if (opts.websiteFails) {
        api.getWebsite.mockRejectedValueOnce(new Error('boom'));
      } else {
        api.getWebsite.mockResolvedValueOnce({
          id: WEBSITE_ID,
          domain: { id: DOMAIN_ID, domain: DOMAIN },
          aliases: [],
          status: 'active',
          orgId: ORG_ID,
          subscriptionId: SUB_ID,
          createdAt: '2026-01-01T00:00:00Z',
        });
      }
      if (opts.sslThrows) {
        api.getDomainSsl.mockRejectedValueOnce(opts.sslThrows);
      } else {
        api.getDomainSsl.mockResolvedValueOnce(
          opts.cert
            ? {
                cn: opts.cert.cn ?? DOMAIN,
                expires: opts.cert.expires,
                issued: opts.cert.issued ?? '2026-01-01T00:00:00Z',
                issuer: opts.cert.issuer,
                forceHttps: opts.cert.forceHttps ?? true,
              }
            : null,
        );
      }
      return buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
    }

    it('cert expira en 60d → ssl.status=valid + autoRenew=true (LE) + issuer + expiresAt ISO', async () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const expires = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      jest.useFakeTimers().setSystemTime(now);
      const plugin = setupSslTest({
        cert: {
          expires: expires.toISOString(),
          issuer: "Let's Encrypt Authority X3",
        },
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      jest.useRealTimers();
      expect(info.ssl).toEqual({
        status: 'valid',
        expiresAt: expires.toISOString(),
        autoRenew: true,
        issuer: "Let's Encrypt Authority X3",
      });
    });

    it('cert expira en 10d → ssl.status=expiring_soon', async () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const expires = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      jest.useFakeTimers().setSystemTime(now);
      const plugin = setupSslTest({
        cert: {
          expires: expires.toISOString(),
          issuer: "Let's Encrypt R3",
        },
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      jest.useRealTimers();
      expect(info.ssl?.status).toBe('expiring_soon');
      expect(info.ssl?.autoRenew).toBe(true);
    });

    it('cert expira exactamente en 14d (boundary inclusive) → expiring_soon', async () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const expires = new Date(now.getTime() + SSL_EXPIRING_SOON_MS);
      jest.useFakeTimers().setSystemTime(now);
      const plugin = setupSslTest({
        cert: {
          expires: expires.toISOString(),
          issuer: "Let's Encrypt Authority X3",
        },
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      jest.useRealTimers();
      expect(info.ssl?.status).toBe('expiring_soon');
    });

    it('cert expira hace 1d → ssl.status=expired', async () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const expires = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      jest.useFakeTimers().setSystemTime(now);
      const plugin = setupSslTest({
        cert: {
          expires: expires.toISOString(),
          issuer: 'DigiCert SHA2 Secure Server CA',
        },
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      jest.useRealTimers();
      expect(info.ssl?.status).toBe('expired');
      expect(info.ssl?.autoRenew).toBe(false);
    });

    it('getDomainSsl devuelve null (404) → ssl.status=none + sin expiresAt', async () => {
      const plugin = setupSslTest({ cert: null });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.ssl).toEqual({ status: 'none' });
    });

    it('getWebsite falla → ssl=undefined (sin card, no exponer parcial)', async () => {
      const plugin = setupSslTest({
        websiteFails: true,
        cert: null,
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.ssl).toBeUndefined();
    });

    it('getDomainSsl lanza error no-INVALID_STATE → ssl=undefined', async () => {
      const plugin = setupSslTest({
        cert: null,
        sslThrows: new ProvisionerPluginError(
          'orchd 5xx',
          'PROVIDER_INTERNAL_ERROR',
          true,
        ),
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.ssl).toBeUndefined();
    });

    it('cert con expires ilegible → ssl=undefined (no exponer parcial)', async () => {
      const plugin = setupSslTest({
        cert: {
          expires: 'not-a-date',
          issuer: "Let's Encrypt Authority X3",
        },
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.ssl).toBeUndefined();
    });
  });

  // ─── Sprint 15C.II Fase F.10 — apps CMS instaladas ────────────────────
  //    ADR-077 Amendment A9 + ADR-083 Amendment A9. Capability-driven por
  //    presencia: getServiceInfo enumera apps via getWebsiteApps (fail-soft)
  //    y construye AppPresence[]. WP requiere defaultWpUserId presente para
  //    declarar la action 'open_app_admin' (D5 frozen); Joomla siempre la
  //    declara (URL canónica). buildApiMock default `getWebsiteApps: null`
  //    → info.apps undefined; tests sobreescriben con apps explícitas.

  describe('getServiceInfo() — apps F.10', () => {
    const APP_WP_WITH_DEFAULT = {
      id: 'app-uuid-wp-1',
      app: 'wordpress' as const,
      version: '6.4.2',
      defaultWpUserId: 42,
    };
    const APP_WP_NO_DEFAULT = {
      id: 'app-uuid-wp-2',
      app: 'wordpress' as const,
      version: '6.4.2',
    };
    const APP_WP_BLOG_PATH = {
      id: 'app-uuid-wp-3',
      app: 'wordpress' as const,
      version: '6.3.1',
      path: 'blog',
      defaultWpUserId: 99,
    };
    const APP_JOOMLA = {
      id: 'app-uuid-joomla-1',
      app: 'joomla' as const,
      version: '5.0.0',
    };

    function setupAppsTest(args: { apps: unknown[] | null }) {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValue({
        id: SUB_ID,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getSubscriptionBandwidth.mockResolvedValue({ usedMb: 100 });
      api.calculateResourceUsage.mockResolvedValue({ items: [] });
      api.getWebsite.mockResolvedValue({
        id: WEBSITE_ID,
        domain: { id: 'domain-uuid', domain: DOMAIN },
        aliases: [],
        status: 'active',
        orgId: ORG_ID,
        createdAt: '2026-01-01T00:00:00Z',
      });
      api.getDomainSsl.mockResolvedValue(null);
      if (args.apps === null) {
        api.getWebsiteApps.mockResolvedValue(null);
      } else {
        api.getWebsiteApps.mockResolvedValue({ items: args.apps });
      }
      return buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
    }

    it('website sin apps (getWebsiteApps null) → info.apps undefined (capability-driven por presencia)', async () => {
      const plugin = setupAppsTest({ apps: null });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.apps).toBeUndefined();
    });

    it('getWebsiteApps responde array vacío → info.apps undefined (NO array vacío misleading)', async () => {
      const plugin = setupAppsTest({ apps: [] });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.apps).toBeUndefined();
    });

    it('WP con defaultWpUserId → AppPresence con action open_app_admin', async () => {
      const plugin = setupAppsTest({ apps: [APP_WP_WITH_DEFAULT] });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.apps).toHaveLength(1);
      const app = info.apps![0];
      expect(app.appId).toBe('app-uuid-wp-1');
      expect(app.kind).toBe('wordpress');
      expect(app.label).toBe('plugin.enhance_cp.apps.wordpress');
      expect(app.version).toBe('6.4.2');
      expect(app.path).toBeUndefined();
      expect(app.actions).toHaveLength(1);
      expect(app.actions[0].slug).toBe('open_app_admin');
    });

    it('WP sin defaultWpUserId → AppPresence con actions=[] (frontend renderiza disabled)', async () => {
      const plugin = setupAppsTest({ apps: [APP_WP_NO_DEFAULT] });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.apps).toHaveLength(1);
      expect(info.apps![0].actions).toEqual([]);
    });

    it('Joomla → AppPresence con action open_app_admin (siempre disponible — URL canónica)', async () => {
      const plugin = setupAppsTest({ apps: [APP_JOOMLA] });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.apps).toHaveLength(1);
      const app = info.apps![0];
      expect(app.kind).toBe('joomla');
      expect(app.label).toBe('plugin.enhance_cp.apps.joomla');
      expect(app.actions).toHaveLength(1);
      expect(app.actions[0].slug).toBe('open_app_admin');
    });

    it('multi-instancia: 2 WP (root + /blog) + 1 Joomla → 3 entries diferenciadas por path', async () => {
      const plugin = setupAppsTest({
        apps: [APP_WP_WITH_DEFAULT, APP_WP_BLOG_PATH, APP_JOOMLA],
      });
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.apps).toHaveLength(3);
      expect(info.apps![0].path).toBeUndefined(); // root
      expect(info.apps![1].path).toBe('blog');
      expect(info.apps![2].kind).toBe('joomla');
    });

    it('fail-soft: getWebsiteApps lanza → info.apps undefined (NO bloquea getServiceInfo)', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValue({
        id: SUB_ID,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getSubscriptionBandwidth.mockResolvedValue({ usedMb: 100 });
      api.calculateResourceUsage.mockResolvedValue({ items: [] });
      api.getWebsite.mockResolvedValue(null);
      api.getWebsiteApps.mockRejectedValue(new Error('boom orchd'));
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      // El status sigue activo + métricas presentes (SSL/quota/status no bloqueados).
      expect(info.status).toBe('active');
      expect(info.apps).toBeUndefined();
    });
  });

  // ─── executeAction('open_app_admin') — Sprint 15C.II Fase F.10 ──────
  //    ADR-077 Amendment A9 + ADR-083 Amendment A9. Dispatcher por kind:
  //    WP → SSO contractual getDefaultWpSsoUser + getWordpressUserSsoUrl.
  //    Joomla → URL canónica ${site_url}/administrator.

  describe("executeAction('open_app_admin')", () => {
    function setupOpenAppAdminTest(args: {
      apps: unknown[];
      defaultUser?: unknown;
      ssoUrl?: string;
      joomlaInfo?: unknown;
    }) {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValue({
        id: SUB_ID,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
      });
      api.getWebsiteApps.mockResolvedValue({ items: args.apps });
      if (args.defaultUser !== undefined) {
        api.getDefaultWpSsoUser.mockResolvedValue(args.defaultUser);
      }
      if (args.ssoUrl !== undefined) {
        api.getWordpressUserSsoUrl.mockResolvedValue(args.ssoUrl);
      }
      if (args.joomlaInfo !== undefined) {
        api.getJoomlaInfo.mockResolvedValue(args.joomlaInfo);
      }
      return { plugin: buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      ), api };
    }

    it('WP con default user → invoca getWordpressUserSsoUrl + returns {url, appKind:wordpress, urlKind:sso}', async () => {
      const SSO_URL = 'https://panel.test/wp-admin/index.php?token=abc';
      const { plugin, api } = setupOpenAppAdminTest({
        apps: [{ id: 'wp-id', app: 'wordpress', version: '6.4.2', defaultWpUserId: 42 }],
        defaultUser: { id: 42, username: 'admin', email: 'admin@test' },
        ssoUrl: SSO_URL,
      });
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'open_app_admin',
        { appId: 'wp-id' },
      );
      expect(result.success).toBe(true);
      expect(api.getWordpressUserSsoUrl).toHaveBeenCalledWith(
        ORG_ID,
        WEBSITE_ID,
        'wp-id',
        42,
      );
      expect(result.data).toEqual({
        url: SSO_URL,
        appKind: 'wordpress',
        urlKind: 'sso',
        opensIn: 'new_tab',
      });
    });

    it('WP sin default user (404 defensive) → throws INVALID_STATE', async () => {
      const { plugin } = setupOpenAppAdminTest({
        apps: [{ id: 'wp-id', app: 'wordpress', version: '6.4.2' }],
        defaultUser: null, // getDefaultWpSsoUser devuelve null (404)
      });
      await expect(
        plugin.executeAction(buildServiceWithRefs(), 'open_app_admin', {
          appId: 'wp-id',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('Joomla → returns URL canónica ${site_url}/administrator + appKind:joomla + urlKind:canonical', async () => {
      const { plugin } = setupOpenAppAdminTest({
        apps: [{ id: 'joomla-id', app: 'joomla', version: '5.0.0' }],
        joomlaInfo: {
          version: '5.0.0',
          site_url: 'https://mi-cliente.es',
          plugin_count: 3,
          user_count: 1,
        },
      });
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'open_app_admin',
        { appId: 'joomla-id' },
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        url: 'https://mi-cliente.es/administrator',
        appKind: 'joomla',
        urlKind: 'canonical',
        opensIn: 'new_tab',
      });
    });

    it('Joomla site_url con trailing slash → normaliza (no double slash)', async () => {
      const { plugin } = setupOpenAppAdminTest({
        apps: [{ id: 'joomla-id', app: 'joomla', version: '5.0.0' }],
        joomlaInfo: {
          version: '5.0.0',
          site_url: 'https://mi-cliente.es/',
          plugin_count: 3,
          user_count: 1,
        },
      });
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'open_app_admin',
        { appId: 'joomla-id' },
      );
      expect((result.data as { url: string }).url).toBe(
        'https://mi-cliente.es/administrator',
      );
    });

    it('appId no existe en website → throws INVALID_STATE', async () => {
      const { plugin } = setupOpenAppAdminTest({
        apps: [{ id: 'other-app', app: 'wordpress', version: '6.4.2', defaultWpUserId: 1 }],
      });
      await expect(
        plugin.executeAction(buildServiceWithRefs(), 'open_app_admin', {
          appId: 'wp-nonexistent',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('payload sin appId → throws INVALID_PAYLOAD', async () => {
      const { plugin } = setupOpenAppAdminTest({ apps: [] });
      await expect(
        plugin.executeAction(buildServiceWithRefs(), 'open_app_admin', {}),
      ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    });
  });

  // ─── Helpers SSL (ADR-083 Amendment A8.4) ─────────────────────────────

  describe('detectAutoRenew', () => {
    it("true para issuers Let's Encrypt (X3, R3, E1, sin apóstrofe)", () => {
      expect(detectAutoRenew("Let's Encrypt Authority X3")).toBe(true);
      expect(detectAutoRenew("Let's Encrypt R3")).toBe(true);
      expect(detectAutoRenew("Let's Encrypt E1")).toBe(true);
      expect(detectAutoRenew('Lets Encrypt R10')).toBe(true); // sin apóstrofe
    });

    it('false para custom issuers (DigiCert, ZeroSSL, GoDaddy)', () => {
      expect(detectAutoRenew('DigiCert SHA2 Secure Server CA')).toBe(false);
      expect(detectAutoRenew('ZeroSSL RSA Domain Secure Site CA')).toBe(false);
      expect(
        detectAutoRenew('Go Daddy Secure Certificate Authority - G2'),
      ).toBe(false);
    });

    it('false para emisor vacío o string genérico', () => {
      expect(detectAutoRenew('')).toBe(false);
      expect(detectAutoRenew('Unknown CA')).toBe(false);
    });
  });

  describe('parseEnhanceCertDate', () => {
    it('parsea ISO-8601 válido', () => {
      const d = parseEnhanceCertDate('2026-08-15T12:34:56Z');
      expect(d?.toISOString()).toBe('2026-08-15T12:34:56.000Z');
    });

    it('parsea RFC-2822', () => {
      const d = parseEnhanceCertDate('Sat, 15 Aug 2026 12:34:56 GMT');
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2026);
    });

    it('devuelve null para strings ilegibles o vacíos', () => {
      expect(parseEnhanceCertDate('not-a-date')).toBeNull();
      expect(parseEnhanceCertDate('')).toBeNull();
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
      // recalculate_provider_metrics requiere refs válidos (orgId + subscriptionId desde
      // service.metadata + provider_reference) — mismo guard que las
      // ex-actions view_disk/bandwidth tenían pre Sprint 15C.II Fase B.
      await expect(
        plugin.executeAction(service, 'recalculate_provider_metrics', {}),
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
        NewPassword: expect.stringMatching(/^[0-9a-f]{32}$/),
      });
      expect(result.sideEffects).toEqual(['service.password_reset']);
    });

    // Sprint 15C.II Fase D (gap G2 — ADR-083 Amendment A4.5): defense-in-depth
    // integration test que invoca el plugin a través del wrapper canónico
    // `executeActionWithCacheInvalidation`. Verifica end-to-end que la
    // password plaintext devuelta por el plugin queda redactada en
    // `audit_change_log` (R12 compliance) pero conservada en el evento
    // `service.action_executed` (consumo del listener email Sprint 15C.II
    // Fase D — `notifications-on-password-reset`).
    it('reset_account_password vía wrapper: audit redactado + evento plaintext (gap G2 R12)', async () => {
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

      const cache = {
        get: jest.fn(),
        set: jest.fn(),
        invalidate: jest.fn().mockResolvedValue(undefined),
        invalidateAll: jest.fn(),
      } as unknown as ProvisioningCacheService;
      const events = {
        emit: jest.fn(),
      } as unknown as EventEmitter2;
      const audit = {
        logChange: jest.fn().mockResolvedValue(undefined),
        logAccess: jest.fn().mockResolvedValue(undefined),
      };

      const result = await executeActionWithCacheInvalidation(
        plugin,
        buildServiceWithRefs(),
        'reset_account_password',
        {},
        {
          actorUserId: USER_ID,
          ipAddress: '10.0.0.1',
          userAgent: 'jest',
          actorIsAdmin: false,
        },
        cache,
        events,
        audit as never,
      );

      // El wrapper devuelve el ActionResult sin tocar (la sanitización solo
      // aplica al audit_change_log persistido).
      expect(result.success).toBe(true);
      const plaintextPwd = result.data?.password as string;
      expect(plaintextPwd).toMatch(/^[0-9a-f]{32}$/);

      // Audit fila persistida: data.password = '[REDACTED]' (R12).
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service.action_executed:reset_account_password',
          changes_after: expect.objectContaining({
            data: { password: '[REDACTED]' },
          }),
        }),
      );
      const auditCall = audit.logChange.mock.calls[0][0] as {
        changes_after: { data?: { password?: string } };
      };
      expect(auditCall.changes_after.data?.password).not.toBe(plaintextPwd);

      // Evento canónico conserva plaintext (consumido por listener email
      // in-memory; nunca se persiste con plaintext).
      expect(events.emit).toHaveBeenCalledWith(
        'service.action_executed',
        expect.objectContaining({
          action_slug: 'reset_account_password',
          success: true,
          data: { password: plaintextPwd },
        }),
      );
    });

    // Sprint 15C.II Fase B: test 'view_bandwidth_usage: read-only sin side effects'
    // eliminado — la action ya no existe en el manifest (decisión doctrinal A1
    // frozen, ADR-083 Amendment A4.1). Las métricas bandwidth + disk siguen
    // disponibles en `getServiceInfo().metrics` y se refrescan vía botón ↻ en
    // MetricsBar + server action refreshServiceInfoAction con forceRevalidate.

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
      const data = result.data as {
        zone: { records: unknown[]; dnssec?: unknown };
      };
      expect(data.zone.records).toHaveLength(1);
      // Zona sin DNSSEC firmado → el sub-objeto `dnssec` NO está presente.
      expect(data.zone.dnssec).toBeUndefined();
      expect(api.getDnsZone).toHaveBeenCalledWith(ORG_ID, WEBSITE_ID, DOMAIN);
    });

    it('list_dns_records: zona con DNSSEC firmado → result.data.zone.dnssec presente (Amendment A5.3)', async () => {
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
        dnssecDsRecords: '12345 13 2 ABCDEF...',
        dnssecDnskeyRecords: '257 3 13 AwEAA...',
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
      const data = result.data as {
        zone: { dnssec?: { dsRecords: string; dnskeyRecords: string } };
      };
      expect(data.zone.dnssec).toEqual({
        dsRecords: '12345 13 2 ABCDEF...',
        dnskeyRecords: '257 3 13 AwEAA...',
      });
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

    it('change_package: PATCH subscription planId + actualiza service.metadata.enhance_plan_id (Fase 15C.H bug fix)', async () => {
      const api = buildApiMock();
      api.patchSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        planId: 99,
        planName: 'plan-99',
      });
      const prismaMock = buildPrismaMock({ install: VALID_INSTALL });
      const plugin = buildPlugin(
        prismaMock,
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const service = buildServiceWithRefs();
      const result = await plugin.executeAction(service, 'change_package', {
        planId: 99,
      });
      expect(result.success).toBe(true);
      expect(api.patchSubscription).toHaveBeenCalledWith(ORG_ID, SUB_ID, {
        planId: 99,
      });
      // Fase 15C.H: el plugin DEBE actualizar metadata.enhance_plan_id tras
      // éxito del PATCH a Enhance. Sin esto, el cron L3
      // EnhanceReconciliationCron emite plan_divergence false positive.
      expect(prismaMock.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: service.id },

          data: expect.objectContaining({
            metadata: expect.objectContaining({
              enhance_org_id: ORG_ID,
              enhance_plan_id: 99,
            }),
          }),
        }),
      );
    });

    it('recalculate_provider_metrics (Amendment A5.1, antes force_resync): PUT calculate-resource-usage + side_effect service.metrics_invalidated', async () => {
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
        'recalculate_provider_metrics',
        {},
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe(
        'plugin.enhance_cp.actions.recalculate_provider_metrics.success',
      );
      expect(result.sideEffects).toEqual(['service.metrics_invalidated']);
      expect(api.calculateResourceUsage).toHaveBeenCalledTimes(1);
    });

    it('list_available_plans (Amendment A3): GET /orgs/{master}/plans + devuelve plans + total', async () => {
      const api = buildApiMock();
      api.listPlans.mockResolvedValueOnce({
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
      });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'list_available_plans',
        {},
      );
      expect(result.success).toBe(true);
      const data = result.data as {
        plans: readonly { id: number; name: string }[];
        total: number;
      };
      expect(data.plans).toHaveLength(2);
      expect(data.plans[0].name).toBe('Web Starter');
      expect(data.total).toBe(2);
      expect(api.listPlans).toHaveBeenCalledWith(
        VALID_INSTALL.config.masterOrgId,
      );
      expect(result.sideEffects).toBeUndefined();
    });

    // ─── suspend / unsuspend (Sprint 15C.II Fase F — ADR-077 Amendment A4) ──

    it('suspend_service: PATCH subscription { isSuspended: true } + message; el plugin NO transiciona status ni emite eventos', async () => {
      const api = buildApiMock();
      api.patchSubscription.mockResolvedValueOnce({ id: SUB_ID });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'suspend_service',
        { reason: 'overdue_payment' },
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe(
        'plugin.enhance_cp.actions.suspend_service.success',
      );
      expect(result.data).toEqual({ suspended: true });
      expect(api.patchSubscription).toHaveBeenCalledWith(ORG_ID, SUB_ID, {
        isSuspended: true,
      });
      // R8 audit centralizado: el plugin solo toca el proveedor; el cambio de
      // `services.status` + el evento `service.suspended` los hace el
      // orquestador (ProvisioningService.suspendAsAdmin).
      expect(result.sideEffects).toBeUndefined();
    });

    it('unsuspend_service: PATCH subscription { isSuspended: false } + message', async () => {
      const api = buildApiMock();
      api.patchSubscription.mockResolvedValueOnce({ id: SUB_ID });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const result = await plugin.executeAction(
        buildServiceWithRefs(),
        'unsuspend_service',
        {},
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe(
        'plugin.enhance_cp.actions.unsuspend_service.success',
      );
      expect(result.data).toEqual({ suspended: false });
      expect(api.patchSubscription).toHaveBeenCalledWith(ORG_ID, SUB_ID, {
        isSuspended: false,
      });
    });
  });

  // ─── getServiceInfo: servicio suspendido (ADR-077 A4 — availableActions) ──

  describe('getServiceInfo() — servicio suspendido', () => {
    it('suspendedBy presente → status=suspended + availableActions incluye unsuspend_service, no suspend_service', async () => {
      const api = buildApiMock();
      api.getSubscription.mockResolvedValueOnce({
        id: SUB_ID,
        status: 'active',
        planName: 'Web Pro',
        friendlyName: 'mi-cliente.es',
        suspendedBy: 'admin-uuid',
      });
      api.getSubscriptionBandwidth.mockResolvedValueOnce({ usedMb: 0 });
      api.calculateResourceUsage.mockResolvedValueOnce({ items: [] });
      const plugin = buildPlugin(
        buildPrismaMock({ install: VALID_INSTALL }),
        buildVaultMock(),
        buildCustomersMock(),
        api,
      );
      const info = await plugin.getServiceInfo(buildServiceWithRefs());
      expect(info.status).toBe('suspended');
      const slugs = info.availableActions.map((a) => a.slug);
      expect(slugs).toContain('unsuspend_service');
      expect(slugs).not.toContain('suspend_service');
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

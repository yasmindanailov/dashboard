import {
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPluginError,
  ServiceWithRelations,
} from '../../../core/provisioning/types';

import { InternalProvisionerPlugin } from './internal.plugin';

/**
 * Tests unit InternalProvisionerPlugin — Sprint 11 Fase 11.C (ADR-077 §3 mapping).
 *
 * Cobertura:
 *   - Declaración estática conforme contrato v2.
 *   - provision() devuelve followUp=['mark_active'] sin provider_reference.
 *   - deprovision() no-op (resuelve sin error).
 *   - getStatus() mapea services.status a ServiceInfoStatus canónico.
 *   - getServiceInfo() construye display con label > domain > product.name.
 *   - getSsoUrl() devuelve null (capability flag coherente).
 *   - executeAction() lanza ProvisionerPluginError(INVALID_PAYLOAD).
 */
describe('InternalProvisionerPlugin — Sprint 11 Fase 11.C', () => {
  let plugin: InternalProvisionerPlugin;

  beforeEach(() => {
    plugin = new InternalProvisionerPlugin();
  });

  function buildService(
    over: Partial<ServiceWithRelations> = {},
  ): ServiceWithRelations {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-1',
      status: 'pending' as never,
      label: 'Plan Pro Support Inside',
      domain: null,
      server_id: null,
      provisioner_slug: 'internal',
      provider_reference: null,
      client: {
        id: 'user-1',
        email: 'cliente@aelium.test',
        first_name: 'Carla',
        last_name: 'Test',
        company_name: null,
        phone: null,
        locale: 'es',
        country_code: null,
      },
      product: {
        id: 'prod-1',
        slug: 'support-inside-pro',
        name: 'Support Inside Pro',
        type: 'support_inside',
        provisioner: 'internal',
        provisioner_config: null,
      },
      ...over,
    } as ServiceWithRelations;
  }

  it('declara contrato v2 + capabilities sin SSO/metrics + acciones vacías', () => {
    expect(plugin.slug).toBe('internal');
    expect(plugin.contractVersion).toBe(PROVISIONER_PLUGIN_CONTRACT_VERSION);
    expect(plugin.capabilities).toEqual({
      has_sso_panel: false,
      has_metrics: false,
      has_metrics_history: false,
      requires_server: false,
      provision_mode: 'sync',
      completes_via_task: false,
      supports_reconciliation: false,
      has_dns_management: false, // ADR-077 Amendment A1
    });
    expect(plugin.inlineActions).toEqual([]);
  });

  it('provision() devuelve followUp=[mark_active] con providerReference null', async () => {
    const service = buildService();
    const result = await plugin.provision({
      service,
      client: service.client,
      productConfig: {},
      serverId: null,
      correlationId: 'cor-1',
    });

    expect(result.providerReference).toBeNull();
    expect(result.metadata).toEqual({});
    expect(result.followUp).toEqual(['mark_active']);
  });

  it('deprovision() resuelve sin error (no-op canónico)', async () => {
    await expect(plugin.deprovision()).resolves.toBeUndefined();
  });

  it('getStatus() mapea services.status canónico (pending → pending, active → active, terminated → cancelled)', async () => {
    const pending = await plugin.getStatus(
      buildService({ status: 'pending' as never }),
    );
    expect(pending.status).toBe('pending');

    const active = await plugin.getStatus(
      buildService({ status: 'active' as never }),
    );
    expect(active.status).toBe('active');

    const terminated = await plugin.getStatus(
      buildService({ status: 'terminated' as never }),
    );
    expect(terminated.status).toBe('cancelled');

    const provisioning = await plugin.getStatus(
      buildService({ status: 'provisioning' as never }),
    );
    expect(provisioning.status).toBe('pending');
  });

  it('getServiceInfo() prioriza label > domain > product.name en display.primary', async () => {
    const withLabel = await plugin.getServiceInfo(
      buildService({ label: 'Mi Plan Pro', domain: 'irrelevant.example' }),
    );
    expect(withLabel.display.primary).toBe('Mi Plan Pro');

    const noLabel = await plugin.getServiceInfo(
      buildService({ label: null, domain: 'cliente1.aelium.net' }),
    );
    expect(noLabel.display.primary).toBe('cliente1.aelium.net');

    const noLabelNoDomain = await plugin.getServiceInfo(
      buildService({ label: null, domain: null }),
    );
    expect(noLabelNoDomain.display.primary).toBe('Support Inside Pro');

    expect(noLabelNoDomain.capabilities.hasSsoPanel).toBe(false);
    expect(noLabelNoDomain.availableActions).toEqual([]);
  });

  it('getSsoUrl() devuelve null (plugin no soporta SSO)', async () => {
    expect(await plugin.getSsoUrl()).toBeNull();
  });

  it('executeAction() lanza ProvisionerPluginError(INVALID_PAYLOAD) con retriable=false', async () => {
    const service = buildService();
    await expect(
      plugin.executeAction(service, 'whatever-slug', {}),
    ).rejects.toMatchObject({
      name: 'ProvisionerPluginError',
      code: 'INVALID_PAYLOAD',
      retriable: false,
    });
    await expect(
      plugin.executeAction(service, 'whatever-slug', {}),
    ).rejects.toBeInstanceOf(ProvisionerPluginError);
  });
});

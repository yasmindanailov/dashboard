import {
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPluginError,
  ServiceWithRelations,
} from '../../../core/provisioning/types';

import { ManualProvisionerPlugin } from './manual.plugin';

/**
 * Tests unit ManualProvisionerPlugin — Sprint 11 Fase 11.C (ADR-077 §3 mapping).
 *
 * Cobertura:
 *   - Declaración estática conforme contrato v2 + completes_via_task=true.
 *   - provision() devuelve followUp=['create_setup_task'].
 *   - deprovision() no-op.
 *   - getStatus() añade statusReason cuando pending/provisioning.
 *   - getServiceInfo() expone statusReason 'Pending manual setup by agent'.
 *   - getSsoUrl() devuelve null.
 *   - executeAction() lanza ProvisionerPluginError(INVALID_PAYLOAD).
 */
describe('ManualProvisionerPlugin — Sprint 11 Fase 11.C', () => {
  let plugin: ManualProvisionerPlugin;

  beforeEach(() => {
    plugin = new ManualProvisionerPlugin();
  });

  function buildService(
    over: Partial<ServiceWithRelations> = {},
  ): ServiceWithRelations {
    return {
      id: 'svc-2',
      user_id: 'user-2',
      product_id: 'prod-host',
      status: 'pending' as never,
      label: 'mi-web.com',
      domain: 'mi-web.com',
      server_id: null,
      provisioner_slug: 'manual',
      provider_reference: null,
      client: {
        id: 'user-2',
        email: 'host@aelium.test',
        first_name: 'Carla',
        last_name: 'Test',
        company_name: null,
        phone: null,
        locale: 'es',
        country_code: null,
      },
      product: {
        id: 'prod-host',
        slug: 'hosting-pro',
        name: 'Hosting Pro',
        type: 'hosting_web',
        provisioner: 'manual',
        provisioner_config: null,
      },
      ...over,
    } as ServiceWithRelations;
  }

  it('declara contrato v2 + completes_via_task=true (clave del listener)', () => {
    expect(plugin.slug).toBe('manual');
    expect(plugin.contractVersion).toBe(PROVISIONER_PLUGIN_CONTRACT_VERSION);
    expect(plugin.capabilities.completes_via_task).toBe(true);
    expect(plugin.capabilities.has_sso_panel).toBe(false);
    expect(plugin.capabilities.has_metrics).toBe(false);
    expect(plugin.capabilities.requires_server).toBe(false);
    expect(plugin.capabilities.provision_mode).toBe('sync');
    expect(plugin.inlineActions).toEqual([]);
  });

  it('provision() devuelve followUp=[create_setup_task] (orquestador crea Task pública)', async () => {
    const service = buildService();
    const result = await plugin.provision({
      service,
      client: service.client,
      productConfig: {},
      serverId: null,
      correlationId: 'cor-2',
    });

    expect(result.providerReference).toBeNull();
    expect(result.metadata).toEqual({});
    expect(result.followUp).toEqual(['create_setup_task']);
  });

  it('deprovision() no-op canónico', async () => {
    await expect(plugin.deprovision()).resolves.toBeUndefined();
  });

  it('getStatus() añade statusReason "Pending manual setup" cuando service está pending', async () => {
    const pending = await plugin.getStatus(
      buildService({ status: 'pending' as never }),
    );
    expect(pending.status).toBe('pending');
    expect(pending.statusReason).toBe('Pending manual setup by agent');

    const active = await plugin.getStatus(
      buildService({ status: 'active' as never }),
    );
    expect(active.status).toBe('active');
    expect(active.statusReason).toBeUndefined();
  });

  it('getServiceInfo() expone statusReason cuando pending y display del producto', async () => {
    const info = await plugin.getServiceInfo(buildService());

    expect(info.status).toBe('pending');
    expect(info.statusReason).toBe('Pending manual setup by agent');
    expect(info.display.primary).toBe('mi-web.com');
    expect(info.display.secondary).toBe('Hosting Pro');
    expect(info.capabilities.completes_via_task).toBe(true);
    expect(info.capabilities.hasSsoPanel).toBe(false);
    expect(info.availableActions).toEqual([]);
  });

  it('getSsoUrl() devuelve null (plugin no soporta SSO)', async () => {
    expect(await plugin.getSsoUrl()).toBeNull();
  });

  it('executeAction() lanza ProvisionerPluginError(INVALID_PAYLOAD) — catálogo vacío', async () => {
    const service = buildService();
    await expect(
      plugin.executeAction(service, 'reset_password', {}),
    ).rejects.toMatchObject({
      name: 'ProvisionerPluginError',
      code: 'INVALID_PAYLOAD',
      retriable: false,
    });
    await expect(
      plugin.executeAction(service, 'reset_password', {}),
    ).rejects.toBeInstanceOf(ProvisionerPluginError);
  });
});

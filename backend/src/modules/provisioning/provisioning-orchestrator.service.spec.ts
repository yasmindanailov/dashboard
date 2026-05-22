/* eslint-disable @typescript-eslint/unbound-method */
// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`. Doctrina oficial TS-ESLint para
// specs: deshabilitar a nivel de archivo. Solo aplica a este `.spec.ts`.

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  ProvisionerPlugin,
  ProvisionerPluginError,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
} from '../../core/provisioning/types';

const TEST_MANIFEST: PluginManifest = {
  slug: 'internal',
  version: '0.0.0-test',
  manifestVersion: 'v1',
  label: 'plugin.internal.label',
  description: 'plugin.internal.description',
  docsUrl: 'docs/test/internal.md',
  settingsCategory: 'provisioner',
  configSchema: EMPTY_PLUGIN_SCHEMA,
  secretsSchema: EMPTY_PLUGIN_SCHEMA,
  testConnectionMethod: null,
};

import { ProvisioningOrchestratorService } from './provisioning-orchestrator.service';

/**
 * Tests unit ProvisioningOrchestratorService â€” Sprint 11 Fase 11.B (ADR-077).
 *
 * Cobertura:
 *   - service no encontrado â†’ skip silencioso.
 *   - service ya 'active' â†’ skip idempotente.
 *   - service 'cancelled'/'terminated' â†’ skip terminal.
 *   - plugin no registrado â†’ emit service.provisioning_failed con reason='plugin_not_registered'.
 *   - provision OK con followUp=['mark_active'] â†’ updates status=active + emit service.activated.
 *   - provision OK con followUp=['create_setup_task'] â†’ llama tasks.create.
 *   - plugin lanza ProvisionerPluginError(retriable=true) â†’ re-throw para BullMQ retry.
 *   - plugin lanza ProvisionerPluginError(retriable=false) â†’ status='cancelled' + emit failed.
 *   - handleInvoicePaid encola un job por cada service en items.
 */
describe('ProvisioningOrchestratorService â€” Sprint 11 Fase 11.B', () => {
  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    invoice: { findUnique: jest.Mock };
    supportInsideSubscription: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let tasks: { createFromTrigger: jest.Mock };
  let events: { emit: jest.Mock };
  let queue: { add: jest.Mock };
  let cache: { invalidate: jest.Mock };
  let orchestrator: ProvisioningOrchestratorService;

  function buildPlugin(
    over: Partial<ProvisionerPlugin> = {},
  ): ProvisionerPlugin {
    return {
      slug: 'internal',
      contractVersion: PROVISIONER_PLUGIN_CONTRACT_VERSION,
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: false,
        has_dns_management: false, // ADR-077 Amendment A1
        supports_suspend: false, // ADR-077 Amendment A4
        is_domain_registrar: false, // ADR-077 Amendment A10
      },
      inlineActions: [],
      manifest: TEST_MANIFEST,
      provision: jest.fn(),
      deprovision: jest.fn(),
      getStatus: jest.fn(),
      getServiceInfo: jest.fn(),
      getSsoUrl: jest.fn(),
      executeAction: jest.fn(),
      ...over,
    };
  }

  function setupServiceRow(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-1',
      status: 'pending',
      label: 'Web demo',
      domain: 'demo.aelium.net',
      server_id: null,
      product: {
        id: 'prod-1',
        slug: 'hosting-pro',
        name: 'Hosting Pro',
        type: 'hosting_web',
        provisioner: 'internal',
        provisioner_config: null,
      },
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      service: { findUnique: jest.fn(), update: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'cliente@aelium.test',
          first_name: 'Carla',
          last_name: 'Test',
          language: 'es',
        }),
      },
      invoice: { findUnique: jest.fn() },
      supportInsideSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    registry = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
      listSlugs: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<PluginRegistryService>;
    tasks = { createFromTrigger: jest.fn() };
    events = { emit: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    cache = { invalidate: jest.fn().mockResolvedValue(undefined) };

    orchestrator = new ProvisioningOrchestratorService(
      prisma as never,
      registry,
      tasks as never,
      events as unknown as EventEmitter2,
      queue as never,
      cache as never,
    );
  });

  it('service no encontrado â†’ skip silencioso (no throw, no emit)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);
    await orchestrator.provisionService('svc-missing', 'cor-1');
    expect(events.emit).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('service ya active â†’ skip idempotente', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({ status: 'active' }),
    );
    await orchestrator.provisionService('svc-1', 'cor-1');
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('service en estado terminal (cancelled/terminated) â†’ skip', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({ status: 'cancelled' }),
    );
    await orchestrator.provisionService('svc-1', 'cor-1');
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('plugin no registrado â†’ emit service.provisioning_failed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    registry.get.mockReturnValue(null);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'plugin_not_registered',
      }),
    );
  });

  it('provision OK followUp=mark_active â†’ status=active + emit service.activated', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      provision: jest.fn().mockResolvedValue({
        providerReference: 'EXT-123',
        metadata: { region: 'eu-1' },
        followUp: ['mark_active'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(plugin.provision).toHaveBeenCalled();
    // 1Âª update: status=provisioning + provisioner_slug
    // 2Âª update: provider_reference + metadata
    // 3Âª update (mark_active): status=active
    expect(prisma.service.update).toHaveBeenCalledTimes(3);
    expect(events.emit).toHaveBeenCalledWith(
      'service.activated',
      expect.objectContaining({ service_id: 'svc-1', user_id: 'user-1' }),
    );
    // Sprint 15C.II Fase C round 3: invalidar cache `service_info:${id}`
    // tras persistir nueva metadata (linea ~221 orchestrator). Sin esto
    // el wrapper getServiceInfoWithCache devolvía cached versión vieja
    // hasta TTL 60s aunque el plugin ya hubiera creado refs externas.
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
  });

  it('provision OK followUp=create_setup_task â†’ llama tasks.create', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      slug: 'manual',
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: true,
        supports_reconciliation: false,
        has_dns_management: false, // ADR-077 Amendment A1
        supports_suspend: false, // ADR-077 Amendment A4
        is_domain_registrar: false, // ADR-077 Amendment A10
      },
      provision: jest.fn().mockResolvedValue({
        providerReference: null,
        metadata: {},
        followUp: ['create_setup_task'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(tasks.createFromTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        source_system: 'provisioning_manual',
        source_id: 'svc-1',
        client_id: 'user-1',
      }),
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=true) â†’ re-throw para BullMQ retry', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      provision: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError('timeout', 'PROVIDER_TIMEOUT', true),
        ),
    });
    registry.get.mockReturnValue(plugin);

    await expect(
      orchestrator.provisionService('svc-1', 'cor-1'),
    ).rejects.toThrow(ProvisionerPluginError);

    // No marca cancelled â€” el reintento decidirÃ¡.
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.anything(),
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=false) â†’ status=cancelled + emit failed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      provision: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError(
            'auth fail',
            'PROVIDER_AUTH_FAILED',
            false,
          ),
        ),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    // Debe haberse llamado update con status=cancelled tras el fallo.
    const updateCalls = prisma.service.update.mock.calls as Array<
      [{ data?: { status?: string } }]
    >;
    const cancelCall = updateCalls.find(
      (c) => c[0].data?.status === 'cancelled',
    );
    expect(cancelCall).toBeDefined();
    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'PROVIDER_AUTH_FAILED',
      }),
    );
    // Sprint 15C.II Fase C round 3: invalidar cache también tras failure
    // permanente (status pasa a cancelled, UI debe ver el cambio inmediato
    // sin esperar TTL).
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
  });

  it('handleInvoicePaid encola un job por cada service en items', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      items: [
        { service_id: 'svc-A' },
        { service_id: 'svc-B' },
        { service_id: null },
      ],
    });

    await orchestrator.handleInvoicePaid({
      invoice_id: 'inv-1',
      user_id: 'user-1',
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
    const addCalls = queue.add.mock.calls as Array<
      [unknown, { service_id: string }]
    >;
    const enqueuedServiceIds = addCalls.map((c) => c[1].service_id).sort();
    expect(enqueuedServiceIds).toEqual(['svc-A', 'svc-B']);
  });

  it('handleInvoicePaid sin items service â†’ no encola (debug log)', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-2',
      items: [{ service_id: null }, { service_id: null }],
    });

    await orchestrator.handleInvoicePaid({
      invoice_id: 'inv-2',
      user_id: 'user-1',
    });

    expect(queue.add).not.toHaveBeenCalled();
  });
});

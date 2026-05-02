/* eslint-disable @typescript-eslint/unbound-method */
// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`. Doctrina oficial TS-ESLint para
// specs: deshabilitar a nivel de archivo. Solo aplica a este `.spec.ts`.

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  ProvisionerPlugin,
  ProvisionerPluginError,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
} from '../../core/provisioning/types';

import { ProvisioningOrchestratorService } from './provisioning-orchestrator.service';

/**
 * Tests unit ProvisioningOrchestratorService — Sprint 11 Fase 11.B (ADR-077).
 *
 * Cobertura:
 *   - service no encontrado → skip silencioso.
 *   - service ya 'active' → skip idempotente.
 *   - service 'cancelled'/'terminated' → skip terminal.
 *   - plugin no registrado → emit service.provisioning_failed con reason='plugin_not_registered'.
 *   - provision OK con followUp=['mark_active'] → updates status=active + emit service.activated.
 *   - provision OK con followUp=['create_setup_task'] → llama tasks.create.
 *   - plugin lanza ProvisionerPluginError(retriable=true) → re-throw para BullMQ retry.
 *   - plugin lanza ProvisionerPluginError(retriable=false) → status='cancelled' + emit failed.
 *   - handleInvoicePaid encola un job por cada service en items.
 */
describe('ProvisioningOrchestratorService — Sprint 11 Fase 11.B', () => {
  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    invoice: { findUnique: jest.Mock };
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let tasks: { create: jest.Mock };
  let events: { emit: jest.Mock };
  let queue: { add: jest.Mock };
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
      },
      inlineActions: [],
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
    };
    registry = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
      listSlugs: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<PluginRegistryService>;
    tasks = { create: jest.fn() };
    events = { emit: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    orchestrator = new ProvisioningOrchestratorService(
      prisma as never,
      registry,
      tasks as never,
      events as unknown as EventEmitter2,
      queue as never,
    );
  });

  it('service no encontrado → skip silencioso (no throw, no emit)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);
    await orchestrator.provisionService('svc-missing', 'cor-1');
    expect(events.emit).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('service ya active → skip idempotente', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({ status: 'active' }),
    );
    await orchestrator.provisionService('svc-1', 'cor-1');
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('service en estado terminal (cancelled/terminated) → skip', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({ status: 'cancelled' }),
    );
    await orchestrator.provisionService('svc-1', 'cor-1');
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('plugin no registrado → emit service.provisioning_failed', async () => {
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

  it('provision OK followUp=mark_active → status=active + emit service.activated', async () => {
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
    // 1ª update: status=provisioning + provisioner_slug
    // 2ª update: provider_reference + metadata
    // 3ª update (mark_active): status=active
    expect(prisma.service.update).toHaveBeenCalledTimes(3);
    expect(events.emit).toHaveBeenCalledWith(
      'service.activated',
      expect.objectContaining({ service_id: 'svc-1', user_id: 'user-1' }),
    );
  });

  it('provision OK followUp=create_setup_task → llama tasks.create', async () => {
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
      },
      provision: jest.fn().mockResolvedValue({
        providerReference: null,
        metadata: {},
        followUp: ['create_setup_task'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'support_setup',
        client_id: 'user-1',
        service_id: 'svc-1',
      }),
      'user-1',
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=true) → re-throw para BullMQ retry', async () => {
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

    // No marca cancelled — el reintento decidirá.
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.anything(),
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=false) → status=cancelled + emit failed', async () => {
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

  it('handleInvoicePaid sin items service → no encola (debug log)', async () => {
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

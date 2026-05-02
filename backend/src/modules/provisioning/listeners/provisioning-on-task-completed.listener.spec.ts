// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`. Doctrina oficial TS-ESLint
// para specs: deshabilitar a nivel de archivo.

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../../core/provisioning/plugin-registry';
import {
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
} from '../../../core/provisioning/types';

import { ProvisioningOnTaskCompletedListener } from './provisioning-on-task-completed.listener';

/**
 * Tests unit ProvisioningOnTaskCompletedListener — Sprint 11 Fase 11.C.
 *
 * Cobertura canónica EC-P11-07:
 *   1. task.conversation_id !== null → skip (bridge ticket↔task gestiona).
 *   2. task.service_id == null → skip (irrelevante para provisioning).
 *   3. service no encontrado → log warn, no emit, no update.
 *   4. service ya active → idempotente.
 *   5. service en estado terminal (cancelled/terminated) → skip + log.
 *   6. plugin no registrado → emit service.provisioning_failed.
 *   7. plugin con completes_via_task=false → skip silencioso.
 *   8. plugin con completes_via_task=true → update status=active + emit
 *      service.activated (camino feliz).
 */
describe('ProvisioningOnTaskCompletedListener — Sprint 11 Fase 11.C', () => {
  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock };
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let events: { emit: jest.Mock };
  let listener: ProvisioningOnTaskCompletedListener;

  function buildPlugin(
    over: Partial<ProvisionerPlugin> = {},
  ): ProvisionerPlugin {
    return {
      slug: 'manual',
      contractVersion: PROVISIONER_PLUGIN_CONTRACT_VERSION,
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: true,
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

  function buildTask(
    over: Partial<{
      id: string;
      service_id: string | null;
      conversation_id: string | null;
      type: string;
    }> = {},
  ) {
    return {
      id: 'task-1',
      service_id: 'svc-1',
      conversation_id: null,
      type: 'support_setup',
      ...over,
    };
  }

  function buildService(over: Record<string, unknown> = {}): {
    id: string;
    user_id: string;
    status: string;
    product: { provisioner: string };
  } {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      status: 'pending',
      product: { provisioner: 'manual' },
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      service: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    registry = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
      listSlugs: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<PluginRegistryService>;
    events = { emit: jest.fn() };

    listener = new ProvisioningOnTaskCompletedListener(
      prisma as never,
      registry,
      events as unknown as EventEmitter2,
    );
  });

  it('EC-P11-07: task.conversation_id !== null → skip (bridge gestiona)', async () => {
    await listener.handle({
      task: buildTask({ conversation_id: 'conv-42' }),
      completedBy: 'agent-1',
    });
    expect(prisma.service.findUnique).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('task sin service_id → skip (no relevante para provisioning)', async () => {
    await listener.handle({
      task: buildTask({ service_id: null }),
      completedBy: 'agent-1',
    });
    expect(prisma.service.findUnique).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('service no encontrado → log warn, no emit, no update', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);
    await listener.handle({
      task: buildTask({ service_id: 'svc-missing' }),
      completedBy: 'agent-1',
    });
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('service ya active → idempotente (no update, no emit)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildService({ status: 'active' }),
    );
    await listener.handle({
      task: buildTask(),
      completedBy: 'agent-1',
    });
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('service en estado terminal (cancelled) → skip + log warn', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildService({ status: 'cancelled' }),
    );
    await listener.handle({
      task: buildTask(),
      completedBy: 'agent-1',
    });
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('plugin no registrado → emit service.provisioning_failed con reason=plugin_not_registered', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildService());
    registry.get.mockReturnValue(null);

    await listener.handle({
      task: buildTask(),
      completedBy: 'agent-1',
    });

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        user_id: 'user-1',
        provisioner_slug: 'manual',
        reason: 'plugin_not_registered',
      }),
    );
  });

  it('plugin con completes_via_task=false → skip silencioso (otro mecanismo activa)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildService());
    registry.get.mockReturnValue(
      buildPlugin({
        slug: 'internal',
        capabilities: {
          has_sso_panel: false,
          has_metrics: false,
          has_metrics_history: false,
          requires_server: false,
          provision_mode: 'sync',
          completes_via_task: false,
          supports_reconciliation: false,
        },
      }),
    );

    await listener.handle({
      task: buildTask(),
      completedBy: 'agent-1',
    });

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('camino feliz: completes_via_task=true → status=active + emit service.activated', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildService());
    registry.get.mockReturnValue(buildPlugin());

    await listener.handle({
      task: buildTask(),
      completedBy: 'agent-1',
    });

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { status: 'active' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'service.activated',
      expect.objectContaining({
        service_id: 'svc-1',
        user_id: 'user-1',
        correlation_id: 'task-task-1',
      }),
    );
  });

  it('error inesperado en BD → log + degradación silenciosa (no throw)', async () => {
    prisma.service.findUnique.mockRejectedValueOnce(
      new Error('DB connection lost'),
    );

    await expect(
      listener.handle({
        task: buildTask(),
        completedBy: 'agent-1',
      }),
    ).resolves.toBeUndefined();

    expect(events.emit).not.toHaveBeenCalled();
  });
});

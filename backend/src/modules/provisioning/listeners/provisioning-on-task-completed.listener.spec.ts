// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`. Doctrina oficial TS-ESLint para
// specs: deshabilitar a nivel de archivo.

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../../core/provisioning/plugin-registry';
import { ProvisioningOnTaskCompletedListener } from './provisioning-on-task-completed.listener';

/**
 * Tests unit ProvisioningOnTaskCompletedListener.
 *
 * Foco H5/GL-17: el 2º sitio de emisión de `service.activated` (la rama
 * asíncrona del provisioning real: reconcile → task.completed → activación).
 * Tras la migración a Outbox, la transición `status='active'` y el
 * `service.activated` deben persistirse en la MISMA `$transaction` (R8), y el
 * payload debe llevar `correlation_id: task-<id>`. Cubre además el filtrado
 * canónico (source_system, capability flag, estados terminales).
 */
describe('ProvisioningOnTaskCompletedListener — H5/GL-17 (service.activated vía Outbox)', () => {
  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let events: { emit: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let listener: ProvisioningOnTaskCompletedListener;

  function pluginWith(completes_via_task: boolean) {
    return {
      capabilities: { completes_via_task },
    } as unknown as ReturnType<PluginRegistryService['get']>;
  }

  function serviceRow(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      status: 'provisioning',
      product: { provisioner: 'manual' },
      ...over,
    };
  }

  const TASK_PAYLOAD = {
    task: {
      id: 'task-9',
      source_system: 'provisioning_manual',
      source_id: 'svc-1',
    },
    completedBy: 'agent-1',
  };

  beforeEach(() => {
    prisma = {
      service: { findUnique: jest.fn(), update: jest.fn() },
      // `tx === prisma` en el mock → `tx.service.update === prisma.service.update`
      // y `outbox.enqueue` recibe `(prisma, ...)`.
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    registry = {
      get: jest.fn(),
    } as unknown as jest.Mocked<PluginRegistryService>;
    events = { emit: jest.fn() };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    listener = new ProvisioningOnTaskCompletedListener(
      prisma as never,
      registry,
      events as unknown as EventEmitter2,
      outbox as never,
    );
  });

  it('happy path: task provisioning_manual + plugin completes_via_task → status=active + service.activated vía Outbox en la misma tx', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(serviceRow());
    registry.get.mockReturnValue(pluginWith(true));

    await listener.handle(TASK_PAYLOAD);

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { status: 'active' },
    });
    // R8 (GL-17): persistido vía Outbox dentro de la tx (tx === prisma en el mock),
    // con correlation_id derivado de la task.
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'service.activated',
      expect.objectContaining({
        service_id: 'svc-1',
        user_id: 'user-1',
        correlation_id: 'task-task-9',
      }),
    );
    // El happy path NO emite service.provisioning_failed.
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('source_system distinto de provisioning_manual → no hace nada', async () => {
    await listener.handle({
      task: { id: 't', source_system: 'support_ticket', source_id: 'svc-1' },
    });

    expect(prisma.service.findUnique).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('servicio ya active → idempotente (sin update ni enqueue)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      serviceRow({ status: 'active' }),
    );

    await listener.handle(TASK_PAYLOAD);

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('servicio en estado terminal (cancelled) → no reactiva', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      serviceRow({ status: 'cancelled' }),
    );

    await listener.handle(TASK_PAYLOAD);

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('plugin sin completes_via_task → no activa (otro mecanismo lo hará)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(serviceRow());
    registry.get.mockReturnValue(pluginWith(false));

    await listener.handle(TASK_PAYLOAD);

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('plugin no registrado → service.provisioning_failed (alerta, sigue emit directo) y NO activa', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(serviceRow());
    registry.get.mockReturnValue(null);

    await listener.handle(TASK_PAYLOAD);

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'plugin_not_registered',
      }),
    );
  });
});

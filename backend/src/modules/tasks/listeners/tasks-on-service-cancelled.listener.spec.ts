// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`.

import { TasksOnServiceCancelledListener } from './tasks-on-service-cancelled.listener';

/**
 * Tests unit TasksOnServiceCancelledListener.
 *
 * Foco H5/GL-17: tras migrar `service.cancelled` a Outbox, este handler se
 * invoca con semántica at-least-once y el `OutboxWorker` reintenta el EVENTO
 * ENTERO si CUALQUIER `@OnEvent` lanza (re-disparando al listener hermano de
 * notificaciones, que NO deduplica → email duplicado). Por eso TODO el cuerpo
 * —incluida la lectura `findFirst`— debe ser fail-soft: un fallo se loguea y se
 * traga, NUNCA propaga al worker.
 */
describe('TasksOnServiceCancelledListener — H5/GL-17 fail-soft', () => {
  let prisma: { task: { findFirst: jest.Mock } };
  let tasks: { cancel: jest.Mock };
  let listener: TasksOnServiceCancelledListener;

  const PAYLOAD = {
    service_id: 'svc-1',
    user_id: 'user-1',
    reason: 'overdue_payment',
  };

  beforeEach(() => {
    prisma = { task: { findFirst: jest.fn() } };
    tasks = { cancel: jest.fn().mockResolvedValue(undefined) };
    listener = new TasksOnServiceCancelledListener(
      prisma as never,
      tasks as never,
    );
  });

  it('hay task provisioning_manual activa → la cancela', async () => {
    prisma.task.findFirst.mockResolvedValueOnce({ id: 'task-7' });

    await listener.handle(PAYLOAD);

    expect(tasks.cancel).toHaveBeenCalledWith(
      'task-7',
      { reason: 'Service cancelado (overdue_payment)' },
      'user-1',
    );
  });

  it('sin task activa → no-op', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(null);

    await listener.handle(PAYLOAD);

    expect(tasks.cancel).not.toHaveBeenCalled();
  });

  it('REGRESIÓN GL-17: si el findFirst falla, el handler NO propaga (fail-soft) → el evento Outbox no se reintenta', async () => {
    prisma.task.findFirst.mockRejectedValueOnce(new Error('db transient'));

    // No debe lanzar: si lanzara, el OutboxWorker reintentaría service.cancelled
    // y re-dispararía el email de cancelación (sin dedup) al cliente.
    await expect(listener.handle(PAYLOAD)).resolves.toBeUndefined();
    expect(tasks.cancel).not.toHaveBeenCalled();
  });

  it('si tasks.cancel falla, tampoco propaga (fail-soft)', async () => {
    prisma.task.findFirst.mockResolvedValueOnce({ id: 'task-7' });
    tasks.cancel.mockRejectedValueOnce(new Error('cancel failed'));

    await expect(listener.handle(PAYLOAD)).resolves.toBeUndefined();
  });
});

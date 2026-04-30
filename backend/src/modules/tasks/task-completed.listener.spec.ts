import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskCompletedListener } from './task-completed.listener';

/**
 * Tests unit TaskCompletedListener — Sprint 8 Fase B.9 (2026-04-30).
 *
 * Cubre las 3 reglas canónicas del listener:
 *   1. Sin clientNotes → no dispatch (silencio para no spammear).
 *   2. Tipo maintenance → no dispatch (lo cubre MaintenanceCompletedListener).
 *   3. Sin client_id → no dispatch (salvaguarda).
 * Y el caso happy:
 *   4. clientNotes + tipo no-maintenance + client_id → dispatch correcto
 *      con payload conteniendo task_reason, action_url calculada.
 */
describe('TaskCompletedListener — Sprint 8 Fase B.9', () => {
  let listener: TaskCompletedListener;
  let notifications: { dispatchToUser: jest.Mock };

  const baseTask = {
    id: 'task-1',
    type: 'contact_client',
    title: 'Llamada de bienvenida',
    client_id: 'client-1',
    service_id: 'service-1',
    reason: 'Bienvenida primer servicio',
  };

  beforeEach(async () => {
    notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined) };

    const config = {
      get: jest.fn(
        (_key: string, def?: string) => def ?? 'http://localhost:3002',
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCompletedListener,
        { provide: NotificationsService, useValue: notifications },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    listener = module.get(TaskCompletedListener);
  });

  it('NO dispatch si clientNotes está vacío', async () => {
    await listener.handle({
      task: baseTask,
      completedBy: 'agent-1',
      clientNotes: '',
    });
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('NO dispatch si clientNotes son sólo espacios', async () => {
    await listener.handle({
      task: baseTask,
      completedBy: 'agent-1',
      clientNotes: '   \n  ',
    });
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('NO dispatch para tipo maintenance (MaintenanceCompletedListener lo cubre)', async () => {
    await listener.handle({
      task: { ...baseTask, type: 'maintenance' },
      completedBy: 'agent-1',
      clientNotes: 'Servicio mantenido',
    });
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('NO dispatch para tipo maintenance_management', async () => {
    await listener.handle({
      task: { ...baseTask, type: 'maintenance_management' },
      completedBy: 'agent-1',
      clientNotes: 'Servicio mantenido + gestión',
    });
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('NO dispatch si la tarea no tiene client_id', async () => {
    await listener.handle({
      task: { ...baseTask, client_id: '' },
      completedBy: 'agent-1',
      clientNotes: 'Algo',
    });
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('Dispatch correcto con payload completo cuando tipo + nota + client', async () => {
    await listener.handle({
      task: baseTask,
      completedBy: 'agent-1',
      clientNotes: 'Hablé con el cliente. Próxima revisión en 2 semanas.',
    });
    expect(notifications.dispatchToUser).toHaveBeenCalledTimes(1);
    const [event, payload, recipientId] = notifications.dispatchToUser.mock
      .calls[0] as [string, Record<string, unknown>, string];
    expect(event).toBe('task.completed');
    expect(recipientId).toBe('client-1');
    expect(payload.task_id).toBe('task-1');
    expect(payload.task_reason).toBe('Bienvenida primer servicio');
    expect(payload.client_notes).toContain('Hablé con el cliente');
    expect(payload.task_type_label).toBe('Contactar cliente');
    expect(payload.action_url).toBe('/dashboard/services/service-1');
  });

  it('Dispatch con action_url genérica si la tarea no tiene service_id', async () => {
    await listener.handle({
      task: { ...baseTask, service_id: null },
      completedBy: 'agent-1',
      clientNotes: 'Mensaje de cierre.',
    });
    expect(notifications.dispatchToUser).toHaveBeenCalledTimes(1);
    const [, payload] = notifications.dispatchToUser.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(payload.action_url).toBe('/dashboard');
  });
});

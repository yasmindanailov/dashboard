import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { TasksOverdueService } from './tasks-overdue.service';

/**
 * Tests unit TasksOverdueService — Sprint 8 Fase C (2026-05-01).
 *
 * Cobertura:
 *  - Selección correcta del cutoff con clock fijo.
 *  - Excluye tareas sin `assigned_to` (ADR-072 §6).
 *  - Excluye tareas en estado terminal y sin `due_date`.
 *  - Compare-and-swap: si la tarea cambió de status entre `findMany` y
 *    `updateMany` (carrera), no emite evento.
 *  - Emite `task.overdue` con shape canónico (`task_type_label`,
 *    `task_priority_label`, `task_url`, `days_overdue`, `assigned_to`).
 *  - Lee fresco el setting `tasks.overdue_to_failure_days` cada ejecución
 *    (EC-T8-10).
 */
describe('TasksOverdueService — Sprint 8 Fase C', () => {
  let service: TasksOverdueService;
  let prisma: {
    task: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let events: { emit: jest.Mock };
  let settings: { getNumber: jest.Mock };
  let config: { get: jest.Mock };

  // 2026-05-01 12:00:00 UTC — clock fijo para todos los specs.
  const NOW = new Date('2026-05-01T12:00:00Z');
  const ASSIGNEE_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    prisma = {
      task: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    events = { emit: jest.fn() };
    settings = { getNumber: jest.fn().mockResolvedValue(7) };
    config = {
      get: jest.fn().mockReturnValue('http://localhost:3002'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksOverdueService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: SettingsService, useValue: settings },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(TasksOverdueService);
  });

  it('lee fresco el setting tasks.overdue_to_failure_days en cada ejecución', async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await service.run(NOW);
    await service.run(NOW);

    expect(settings.getNumber).toHaveBeenCalledTimes(2);
    expect(settings.getNumber).toHaveBeenCalledWith(
      'tasks',
      'overdue_to_failure_days',
      7,
    );
  });

  it('calcula cutoff = now - threshold_days y filtra por status no-terminal + assigned_to NOT NULL', async () => {
    settings.getNumber.mockResolvedValue(5); // 5 días
    prisma.task.findMany.mockResolvedValue([]);

    const result = await service.run(NOW);

    expect(result.threshold_days).toBe(5);
    // 2026-05-01 12:00 - 5d = 2026-04-26 12:00
    expect(result.cutoff.toISOString()).toBe('2026-04-26T12:00:00.000Z');
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending', 'in_progress'] },
        assigned_to: { not: null },
        due_date: { lt: result.cutoff },
      },
      select: {
        id: true,
        title: true,
        type: true,
        priority: true,
        assigned_to: true,
        due_date: true,
      },
    });
  });

  it('no emite eventos cuando no hay candidatos', async () => {
    prisma.task.findMany.mockResolvedValue([]);

    const result = await service.run(NOW);

    expect(result.processed).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('marca cada candidato como not_completed_in_time y emite task.overdue con shape canónico', async () => {
    const dueDate = new Date('2026-04-20T08:00:00Z'); // 11 días antes de NOW
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Renovar dominio',
        type: 'contact_client',
        priority: 'high',
        assigned_to: ASSIGNEE_ID,
        due_date: dueDate,
      },
    ]);

    const result = await service.run(NOW);

    expect(result.processed).toBe(1);
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        status: { in: ['pending', 'in_progress'] },
      },
      data: { status: 'not_completed_in_time' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'task.overdue',
      expect.objectContaining({
        task_id: 'task-1',
        task_title: 'Renovar dominio',
        task_type: 'contact_client',
        task_type_label: 'Contactar cliente',
        task_priority: 'high',
        task_priority_label: 'Alta',
        task_url: 'http://localhost:3002/admin/tasks/task-1',
        action_url: '/admin/tasks/task-1',
        days_overdue: 11,
        assigned_to: ASSIGNEE_ID,
      }),
    );
  });

  it('compare-and-swap: si otra carrera ya cerró la tarea, no emite evento', async () => {
    const dueDate = new Date('2026-04-20T08:00:00Z');
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-race',
        title: 'Tarea en carrera',
        type: 'maintenance',
        priority: 'medium',
        assigned_to: ASSIGNEE_ID,
        due_date: dueDate,
      },
    ]);
    // Simula carrera: el UPDATE no afecta filas (otra ejecución la cerró).
    prisma.task.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.run(NOW);

    expect(result.processed).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('procesa múltiples candidatos en una sola ejecución y reporta processed', async () => {
    const dueDate = new Date('2026-04-15T00:00:00Z');
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'A',
        type: 'maintenance',
        priority: 'low',
        assigned_to: ASSIGNEE_ID,
        due_date: dueDate,
      },
      {
        id: 't2',
        title: 'B',
        type: 'custom_work',
        priority: 'critical',
        assigned_to: ASSIGNEE_ID,
        due_date: dueDate,
      },
    ]);

    const result = await service.run(NOW);

    expect(result.processed).toBe(2);
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(prisma.task.updateMany).toHaveBeenCalledTimes(2);
  });

  it('days_overdue es al menos 1 (suelo defensivo) aunque la diferencia sea < 1 día completo', async () => {
    // due_date hace 12h (menos de 1 día completo); el cron lo capturó porque
    // el threshold del setting es 0 (no debería pasar en producción, pero
    // el suelo defensivo evita reportar `days_overdue: 0`).
    settings.getNumber.mockResolvedValue(0);
    const dueDate = new Date('2026-05-01T00:00:00Z');
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-edge',
        title: 'Edge',
        type: 'maintenance',
        priority: 'low',
        assigned_to: ASSIGNEE_ID,
        due_date: dueDate,
      },
    ]);

    await service.run(NOW);

    expect(events.emit).toHaveBeenCalledWith(
      'task.overdue',
      expect.objectContaining({ days_overdue: 1 }),
    );
  });
});

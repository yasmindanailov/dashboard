import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { TasksUnassignedOverdueService } from './tasks-unassigned-overdue.service';

/**
 * Tests unit TasksUnassignedOverdueService — Sprint 8 Fase C + ADR-072.
 *
 * Cobertura:
 *  - Lee SLA por tipo del settings (override por tipo, fallback default).
 *  - Filtra: cola pública (`assigned_to=null`) + estado no-terminal.
 *  - Aplica SLA por tipo, no global.
 *  - Cuando NO hay overdue: no emite evento.
 *  - Emite resumen agregado con `summary` pre-renderizado, `oldest_age_hours`
 *    y `by_type`.
 *  - El summary se trunca a 20 entradas + sufijo "y N más".
 */
type EmitPayload = { summary: string; [k: string]: unknown };
const firstEmitPayload = (spy: jest.Mock): EmitPayload =>
  (spy.mock.calls[0] as unknown as [string, EmitPayload])[1];

describe('TasksUnassignedOverdueService — Sprint 8 Fase C + ADR-072', () => {
  let service: TasksUnassignedOverdueService;
  let prisma: { task: { findMany: jest.Mock } };
  let events: { emit: jest.Mock };
  let settings: { getNumber: jest.Mock };

  const NOW = new Date('2026-05-01T12:00:00Z');

  const slaConfig = (overrides: Record<string, number> = {}) => {
    settings.getNumber.mockImplementation(
      (category: string, key: string, fallback: number): Promise<number> => {
        if (category !== 'tasks') return Promise.resolve(fallback);
        const override = overrides[key];
        return Promise.resolve(override ?? fallback);
      },
    );
  };

  beforeEach(async () => {
    prisma = { task: { findMany: jest.fn().mockResolvedValue([]) } };
    events = { emit: jest.fn() };
    settings = { getNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksUnassignedOverdueService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(TasksUnassignedOverdueService);
    slaConfig();
  });

  it('lee fresco el SLA por tipo + el default cada ejecución', async () => {
    slaConfig({
      'unassigned_sla_hours.default': 24,
      'unassigned_sla_hours.support_setup': 4,
    });
    prisma.task.findMany.mockResolvedValue([]);

    await service.run(NOW);

    // Default + 5 tipos = 6 lookups.
    expect(settings.getNumber).toHaveBeenCalledWith(
      'tasks',
      'unassigned_sla_hours.default',
      24,
    );
    for (const type of TasksUnassignedOverdueService.slaTypes()) {
      expect(settings.getNumber).toHaveBeenCalledWith(
        'tasks',
        `unassigned_sla_hours.${type}`,
        24,
      );
    }
  });

  it('filtra por assigned_to=null + estado no-terminal', async () => {
    await service.run(NOW);

    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        assigned_to: null,
        status: { in: ['pending', 'in_progress'] },
      },
      select: {
        id: true,
        title: true,
        type: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
  });

  it('NO emite cuando todas las tareas están dentro de SLA', async () => {
    slaConfig({ 'unassigned_sla_hours.default': 24 });
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't-fresh',
        title: 'Recién creada',
        type: 'maintenance',
        created_at: new Date(NOW.getTime() - 2 * 3_600_000), // 2h
      },
    ]);

    const result = await service.run(NOW);

    expect(result.total).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('aplica SLA por tipo (no global) — soporte=4h dispara, custom_work=48h no', async () => {
    slaConfig({
      'unassigned_sla_hours.default': 24,
      'unassigned_sla_hours.support_setup': 4,
      'unassigned_sla_hours.custom_work': 48,
    });
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't-support',
        title: 'Setup urgente',
        type: 'support_setup',
        created_at: new Date(NOW.getTime() - 6 * 3_600_000), // 6h > 4h SLA
      },
      {
        id: 't-custom',
        title: 'Trabajo custom',
        type: 'custom_work',
        created_at: new Date(NOW.getTime() - 6 * 3_600_000), // 6h < 48h SLA
      },
    ]);

    const result = await service.run(NOW);

    expect(result.total).toBe(1);
    expect(result.by_type).toEqual({ support_setup: 1 });
    expect(events.emit).toHaveBeenCalledWith(
      'task.unassigned_overdue',
      expect.objectContaining({
        total: 1,
        oldest_age_hours: 6,
        task_ids: ['t-support'],
      }),
    );
    expect(firstEmitPayload(events.emit).summary).toContain('Setup urgente');
  });

  it('reporta oldest_age_hours como el máximo entre las overdue', async () => {
    slaConfig({ 'unassigned_sla_hours.default': 12 });
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'A',
        type: 'maintenance',
        created_at: new Date(NOW.getTime() - 50 * 3_600_000),
      },
      {
        id: 't2',
        title: 'B',
        type: 'maintenance',
        created_at: new Date(NOW.getTime() - 13 * 3_600_000),
      },
    ]);

    const result = await service.run(NOW);

    expect(result.oldest_age_hours).toBe(50);
    expect(events.emit).toHaveBeenCalledWith(
      'task.unassigned_overdue',
      expect.objectContaining({ oldest_age_hours: 50 }),
    );
  });

  it('summary se trunca a 20 entradas y añade sufijo "y N más"', async () => {
    slaConfig({ 'unassigned_sla_hours.default': 1 });
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      id: `t-${i}`,
      title: `Task ${i}`,
      type: 'maintenance' as const,
      created_at: new Date(NOW.getTime() - 5 * 3_600_000),
    }));
    prisma.task.findMany.mockResolvedValue(tasks);

    await service.run(NOW);

    const emitArgs = firstEmitPayload(events.emit);
    const lines = emitArgs.summary.split('\n');
    expect(lines.length).toBe(21); // 20 + sufijo
    expect(lines[20]).toBe('… y 5 más');
  });
});

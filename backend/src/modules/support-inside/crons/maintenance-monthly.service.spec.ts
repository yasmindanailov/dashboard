import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { MaintenanceMonthlyService } from './maintenance-monthly.service';

/**
 * Tests unit MaintenanceMonthlyService — Sprint 8 Fase D.
 *
 * Cobertura crítica de la doctrina ADR-034 §"Recurrencia del
 * mantenimiento" + ADR-072 §"Triggers automáticos sin owner determinable":
 *   - billing_month formato YYYY-MM canónico.
 *   - Sólo procesa slots activos (released_at IS NULL).
 *   - Sólo procesa subscriptions active.
 *   - Filtra services no-active.
 *   - Crea Task type=maintenance_management con assigned_to=null
 *     (cola pública, ADR-072).
 *   - Idempotencia P2002: si la task del mes ya existe, suma a
 *     skipped_idempotent en lugar de fallar.
 *   - Otros errores se relanzan (BullMQ retry).
 */
type TaskCreateArgs = { data: Record<string, unknown> };
const firstCreateArgs = (spy: jest.Mock): TaskCreateArgs =>
  (spy.mock.calls[0] as unknown as [TaskCreateArgs])[0];

describe('MaintenanceMonthlyService — Sprint 8 Fase D', () => {
  let service: MaintenanceMonthlyService;
  let prisma: {
    supportInsideSlot: { findMany: jest.Mock };
    task: { create: jest.Mock };
  };
  let events: { emit: jest.Mock };

  // Reloj fijo: 1 de mayo de 2026 a las 06:00 UTC (la hora canónica del
  // cron). billing_month canónico = "2026-05".
  const NOW = new Date('2026-05-01T06:00:00Z');

  const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
  const SUB_ID = '22222222-2222-2222-2222-222222222222';
  const SLOT_ID = '33333333-3333-3333-3333-333333333333';
  const SERVICE_ID = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
    prisma = {
      supportInsideSlot: { findMany: jest.fn().mockResolvedValue([]) },
      task: { create: jest.fn() },
    };
    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceMonthlyService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(MaintenanceMonthlyService);
  });

  it('billing_month: formato YYYY-MM en UTC', async () => {
    const result = await service.run(NOW);
    expect(result.billing_month).toBe('2026-05');
  });

  it('filtra slots: released_at=null + subscription.status=active + anniversary_day=hoy (D.12.1)', async () => {
    // NOW = 2026-05-01 UTC → anniversary_day = 1.
    await service.run(NOW);
    expect(prisma.supportInsideSlot.findMany).toHaveBeenCalledWith({
      where: {
        released_at: null,
        anniversary_day: 1,
        subscription: { status: 'active' },
      },
      // El include es un shape conocido — el resto de specs lo ejercitan.
      include: expect.anything() as unknown,
    });
  });

  it('anniversary_day se capa a 28 cuando getUTCDate() > 28 (cron día 29-31, D.12.1)', async () => {
    const day31 = new Date('2026-07-31T06:00:00Z');
    await service.run(day31);
    expect(prisma.supportInsideSlot.findMany).toHaveBeenCalledWith({
      where: {
        released_at: null,
        anniversary_day: 28, // cap a 28 — slots de día 29/30/31 no existen por CHECK constraint
        subscription: { status: 'active' },
      },
      include: expect.anything() as unknown,
    });
  });

  it('NO emite ni crea tasks cuando no hay slots elegibles', async () => {
    prisma.supportInsideSlot.findMany.mockResolvedValue([]);
    const result = await service.run(NOW);
    expect(result.created).toBe(0);
    expect(result.candidates).toBe(0);
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('descarta slots cuyo servicio NO está active', async () => {
    prisma.supportInsideSlot.findMany.mockResolvedValue([
      {
        id: SLOT_ID,
        subscription: { id: SUB_ID, client_id: CLIENT_ID },
        slot_type: 'maintenance',
        service: {
          id: SERVICE_ID,
          status: 'cancelled',
          label: 'demo.com',
          domain: 'demo.com',
          product: { name: 'Hosting' },
        },
      },
    ]);
    const result = await service.run(NOW);
    expect(result.candidates).toBe(0);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('crea Task con assigned_to=null + billing_month + metadata canónica', async () => {
    prisma.supportInsideSlot.findMany.mockResolvedValue([
      {
        id: SLOT_ID,
        subscription: { id: SUB_ID, client_id: CLIENT_ID },
        slot_type: 'maintenance',
        service: {
          id: SERVICE_ID,
          status: 'active',
          label: 'mi-web.com',
          domain: 'mi-web.com',
          product: { name: 'Hosting Pro' },
        },
      },
    ]);
    prisma.task.create.mockResolvedValue({ id: 'task-1' });

    const result = await service.run(NOW);

    expect(result.candidates).toBe(1);
    expect(result.created).toBe(1);
    // Extraemos los args del único create() y comparamos campo a campo
    // sin objectContaining anidado (no-unsafe-assignment).
    const createArgs = firstCreateArgs(prisma.task.create);
    expect(createArgs.data.type).toBe('maintenance_management');
    expect(createArgs.data.priority).toBe('medium');
    expect(createArgs.data.client_id).toBe(CLIENT_ID);
    expect(createArgs.data.service_id).toBe(SERVICE_ID);
    expect(createArgs.data.billing_month).toBe('2026-05');
    expect(createArgs.data.is_recurring).toBe(true);
    expect(createArgs.data.recurrence_day).toBe(1);
    expect(createArgs.data.title).toContain('mi-web.com');
    expect(createArgs.data.metadata).toEqual({
      source: 'support_inside_monthly_cron',
      subscription_id: SUB_ID,
      slot_id: SLOT_ID,
      slot_type: 'maintenance',
    });
    // assigned_to es undefined / no presente — coherente con ADR-072
    // (cola pública, no asignación arbitraria).
    expect(createArgs.data.assigned_to).toBeUndefined();
    expect(events.emit).toHaveBeenCalledWith(
      'task.created',
      expect.objectContaining({ task: { id: 'task-1' } }),
    );
  });

  it('idempotencia P2002 → skipped_idempotent +=1 sin fallar la pasada', async () => {
    prisma.supportInsideSlot.findMany.mockResolvedValue([
      {
        id: SLOT_ID,
        subscription: { id: SUB_ID, client_id: CLIENT_ID },
        slot_type: 'maintenance',
        service: {
          id: SERVICE_ID,
          status: 'active',
          label: 'demo.com',
          domain: 'demo.com',
          product: { name: 'Hosting' },
        },
      },
    ]);
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.0.0' },
    );
    prisma.task.create.mockRejectedValue(p2002);

    const result = await service.run(NOW);

    expect(result.created).toBe(0);
    expect(result.skipped_idempotent).toBe(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('error no-P2002 se relanza (BullMQ retry)', async () => {
    prisma.supportInsideSlot.findMany.mockResolvedValue([
      {
        id: SLOT_ID,
        subscription: { id: SUB_ID, client_id: CLIENT_ID },
        slot_type: 'maintenance',
        service: {
          id: SERVICE_ID,
          status: 'active',
          label: 'demo.com',
          domain: 'demo.com',
          product: { name: 'Hosting' },
        },
      },
    ]);
    prisma.task.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.run(NOW)).rejects.toThrow('DB connection lost');
  });
});

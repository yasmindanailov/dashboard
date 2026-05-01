import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { MaintenanceCriticalService } from './maintenance-critical.service';

/**
 * Tests unit MaintenanceCriticalService — Sprint 8 Fase C.
 *
 * Cobertura:
 *  - Lee threshold del settings (`support.maintenance_critical_threshold_days`).
 *  - Filtra: services activos con `checklist_items: { some: {} }`.
 *  - Detecta servicios sin maintenance_log (NUNCA) Y servicios con último
 *    log antes del cutoff.
 *  - NO emite cuando todos los servicios tienen maintenance_log fresco.
 *  - Emite resumen agregado con `summary` pre-renderizado, `total`,
 *    `threshold_days`, `service_ids`.
 *  - Truncado `summary` a 20 entradas + sufijo "y N más".
 */
type EmitPayload = { summary: string; [k: string]: unknown };
type FindManySelect = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
};

const firstEmitPayload = (spy: jest.Mock): EmitPayload =>
  (spy.mock.calls[0] as unknown as [string, EmitPayload])[1];
const firstFindArgs = (spy: jest.Mock): FindManySelect =>
  (spy.mock.calls[0] as unknown as [FindManySelect])[0];

describe('MaintenanceCriticalService — Sprint 8 Fase C', () => {
  let service: MaintenanceCriticalService;
  let prisma: { service: { findMany: jest.Mock } };
  let events: { emit: jest.Mock };
  let settings: { getNumber: jest.Mock };

  const NOW = new Date('2026-05-01T12:00:00Z');
  const DAY = 86_400_000;

  beforeEach(async () => {
    prisma = { service: { findMany: jest.fn().mockResolvedValue([]) } };
    events = { emit: jest.fn() };
    settings = { getNumber: jest.fn().mockResolvedValue(60) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceCriticalService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(MaintenanceCriticalService);
  });

  it('lee fresco el threshold cada ejecución', async () => {
    await service.run(NOW);
    await service.run(NOW);

    expect(settings.getNumber).toHaveBeenCalledTimes(2);
    expect(settings.getNumber).toHaveBeenCalledWith(
      'support',
      'maintenance_critical_threshold_days',
      60,
    );
  });

  it('filtra services activos con checklist_items: { some: {} }', async () => {
    await service.run(NOW);

    const findArgs = firstFindArgs(prisma.service.findMany);
    expect(findArgs.where).toEqual({
      status: 'active',
      checklist_items: { some: {} },
    });
    // shape exacto del select (1 nivel) — el contenido anidado se valida
    // implícitamente por los tests "marca crítico al servicio …".
    expect(findArgs.select).toMatchObject({
      id: true,
      user_id: true,
      label: true,
      product: { select: { name: true } },
    });
    expect(findArgs.select.maintenance_logs).toEqual({
      orderBy: { performed_at: 'desc' },
      take: 1,
      select: { performed_at: true },
    });
  });

  it('NO emite cuando no hay servicios con checklist', async () => {
    prisma.service.findMany.mockResolvedValue([]);

    const result = await service.run(NOW);

    expect(result.total).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('NO emite cuando todos los servicios tienen maintenance_log fresco', async () => {
    settings.getNumber.mockResolvedValue(60);
    prisma.service.findMany.mockResolvedValue([
      {
        id: 'svc-1',
        user_id: 'u1',
        label: 'mi-web.com',
        product: { name: 'Hosting Pro' },
        maintenance_logs: [
          { performed_at: new Date(NOW.getTime() - 30 * DAY) }, // 30d < 60d
        ],
      },
    ]);

    const result = await service.run(NOW);

    expect(result.total).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('marca crítico al servicio que NUNCA tuvo maintenance_log', async () => {
    prisma.service.findMany.mockResolvedValue([
      {
        id: 'svc-never',
        user_id: 'u-never',
        label: 'nunca-tocado.com',
        product: { name: 'Hosting Básico' },
        maintenance_logs: [],
      },
    ]);

    const result = await service.run(NOW);

    expect(result.total).toBe(1);
    expect(events.emit).toHaveBeenCalledWith(
      'maintenance.critical',
      expect.objectContaining({
        total: 1,
        threshold_days: 60,
        service_ids: ['svc-never'],
      }),
    );
    const args = firstEmitPayload(events.emit);
    expect(args.summary).toContain('NUNCA');
  });

  it('marca crítico al servicio con último maintenance_log antes del cutoff', async () => {
    settings.getNumber.mockResolvedValue(60);
    prisma.service.findMany.mockResolvedValue([
      {
        id: 'svc-old',
        user_id: 'u-old',
        label: 'desactualizado.com',
        product: { name: 'Hosting Pro' },
        maintenance_logs: [
          { performed_at: new Date(NOW.getTime() - 90 * DAY) }, // 90d > 60d
        ],
      },
    ]);

    const result = await service.run(NOW);

    expect(result.total).toBe(1);
    expect(events.emit).toHaveBeenCalledWith(
      'maintenance.critical',
      expect.objectContaining({
        total: 1,
        threshold_days: 60,
      }),
    );
    const args = firstEmitPayload(events.emit);
    expect(args.summary).toContain('90d');
  });

  it('summary se trunca a 20 entradas y añade sufijo "y N más"', async () => {
    settings.getNumber.mockResolvedValue(60);
    const services = Array.from({ length: 25 }, (_, i) => ({
      id: `svc-${i}`,
      user_id: `u-${i}`,
      label: `site-${i}.com`,
      product: { name: 'Hosting Pro' },
      maintenance_logs: [],
    }));
    prisma.service.findMany.mockResolvedValue(services);

    await service.run(NOW);

    const emitArgs = firstEmitPayload(events.emit);
    const lines = emitArgs.summary.split('\n');
    expect(lines.length).toBe(21); // 20 + sufijo
    expect(lines[20]).toBe('… y 5 más');
  });

  it('label fallback al product.name cuando service.label es null', async () => {
    prisma.service.findMany.mockResolvedValue([
      {
        id: 'svc-no-label',
        user_id: 'u',
        label: null,
        product: { name: 'Hosting Pro' },
        maintenance_logs: [],
      },
    ]);

    await service.run(NOW);

    const emitArgs = firstEmitPayload(events.emit);
    expect(emitArgs.summary).toContain('Hosting Pro (Hosting Pro)');
  });
});

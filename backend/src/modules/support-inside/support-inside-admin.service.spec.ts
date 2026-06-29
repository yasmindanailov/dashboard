import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupportInsideAdminService } from './support-inside-admin.service';
import { PrismaService } from '../../core/database/prisma.service';
import { PresenceService } from '../presence/presence.service';

/**
 * SupportInsideAdminService — Rediseño UI F3·E8.
 * Cubre: `assignTechnician` (elegibilidad, reasignación de tareas pending,
 * desasignación, not-found, evento de audit) + `getManagedByService` (bloque
 * gestionado por servicio) + `listEligibleTechnicians` (presencia + carga).
 */
describe('SupportInsideAdminService.assignTechnician — F3·E8', () => {
  const SUB = {
    id: 'sub-1',
    client_id: 'client-1',
    assigned_technician_id: 'old-tech',
    slots: [{ id: 'slot-1' }, { id: 'slot-2' }],
  };

  function build(opts: {
    subscription?: typeof SUB | null;
    eligible?: boolean;
    updateManyCount?: number;
  }) {
    const subFindUnique = jest
      .fn()
      .mockResolvedValue(
        opts.subscription === undefined ? SUB : opts.subscription,
      );
    const userFindFirst = jest
      .fn()
      .mockResolvedValue(opts.eligible === false ? null : { id: 'tech' });
    const txUpdate = jest.fn().mockResolvedValue({});
    const txUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: opts.updateManyCount ?? 0 });
    const emit = jest.fn();

    const tx = {
      supportInsideSubscription: { update: txUpdate },
      task: { updateMany: txUpdateMany },
    };
    const prisma = {
      supportInsideSubscription: { findUnique: subFindUnique },
      user: { findFirst: userFindFirst },
      $transaction: (cb: (t: typeof tx) => Promise<number>) => cb(tx),
    } as unknown as PrismaService;
    const events = { emit } as unknown as EventEmitter2;
    const presence = {
      getPresence: jest.fn(),
      getPresenceMap: jest.fn(),
    } as unknown as PresenceService;
    const service = new SupportInsideAdminService(prisma, events, presence);
    return {
      service,
      subFindUnique,
      userFindFirst,
      txUpdate,
      txUpdateMany,
      emit,
    };
  }

  it('asigna técnico elegible + reasigna las tareas pending + emite evento', async () => {
    const { service, txUpdate, txUpdateMany, emit } = build({
      eligible: true,
      updateManyCount: 1,
    });
    const result = await service.assignTechnician('sub-1', 'new-tech');

    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { assigned_technician_id: 'new-tech' },
    });
    // Reasigna SOLO las tareas pending de los slots de la suscripción.
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: {
        source_system: 'support_inside_slot',
        source_id: { in: ['slot-1', 'slot-2'] },
        status: 'pending',
      },
      data: { assigned_to: 'new-tech' },
    });
    expect(result.reassigned_pending_tasks).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      'support_inside.technician_assigned',
      expect.objectContaining({
        subscription_id: 'sub-1',
        client_id: 'client-1',
        technician_id: 'new-tech',
        previous_technician_id: 'old-tech',
        reassigned_pending_tasks: 1,
      }),
    );
  });

  it('desasigna (null) sin validar elegibilidad', async () => {
    const { service, userFindFirst, txUpdate } = build({ updateManyCount: 0 });
    const result = await service.assignTechnician('sub-1', null);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { assigned_technician_id: null },
    });
    expect(result.technician_id).toBeNull();
  });

  it('rechaza técnico no elegible (BadRequest) sin tocar la suscripción', async () => {
    const { service, txUpdate } = build({ eligible: false });
    await expect(
      service.assignTechnician('sub-1', 'not-a-tech'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('suscripción inexistente → NotFound', async () => {
    const { service } = build({ subscription: null });
    await expect(
      service.assignTechnician('nope', 'tech'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SupportInsideAdminService.getManagedByService — F3·E8', () => {
  const MANAGED_SUB = {
    id: 'sub-1',
    service_id: 'svc-si',
    status: 'active',
    started_at: new Date('2026-04-30T00:00:00.000Z'),
    product: {
      slug: 'support-inside-basic-plan',
      name: 'Básico',
      support_inside_config: {
        priority_tier: 'standard',
        response_sla_hours: 24,
      },
    },
    technician: {
      id: 'tech-1',
      first_name: 'Luis',
      last_name: 'Ferrer',
      avatar_url: null,
    },
    slots: [
      {
        id: 'slot-1',
        service_id: 'svc-host',
        anniversary_day: 15,
        slot_type: 'maintenance',
        service: {
          label: 'misitio.com',
          domain: 'misitio.com',
          product: { name: 'Hosting Web' },
        },
      },
    ],
  };

  function build(subscription: unknown) {
    const prisma = {
      supportInsideSubscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
      },
      // enrichSlotsMaintenance: un log de este mes → el slot queda up_to_date.
      maintenanceLog: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { service_id: 'svc-host', performed_at: new Date() },
          ]),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    const presence = {
      getPresence: jest.fn().mockResolvedValue('online'),
      getPresenceMap: jest.fn(),
    } as unknown as PresenceService;
    return new SupportInsideAdminService(prisma, events, presence);
  }

  it('arma el bloque gestionado (técnico+presencia, plan/SLA, progreso)', async () => {
    const service = build(MANAGED_SUB);
    const out = await service.getManagedByService('svc-si');

    expect(out.subscription_id).toBe('sub-1');
    expect(out.service_id).toBe('svc-si');
    expect(out.plan).toEqual({
      slug: 'support-inside-basic-plan',
      name: 'Básico',
      priority_tier: 'standard',
      response_sla_hours: 24,
    });
    expect(out.technician).toEqual({
      id: 'tech-1',
      first_name: 'Luis',
      last_name: 'Ferrer',
      avatar_url: null,
      presence: 'online',
    });
    // 1 slot, con log de este mes → up_to_date → done=total=1, overdue=0.
    expect(out.maintenance.period_total).toBe(1);
    expect(out.maintenance.period_done).toBe(1);
    expect(out.maintenance.overdue_count).toBe(0);
    expect(out.maintenance.slots[0]).toMatchObject({
      id: 'slot-1',
      service_label: 'misitio.com',
      maintenance_status: 'up_to_date',
    });
  });

  it('técnico null cuando la suscripción no tiene técnico asignado', async () => {
    const service = build({ ...MANAGED_SUB, technician: null });
    const out = await service.getManagedByService('svc-si');
    expect(out.technician).toBeNull();
  });

  it('servicio que no es Support Inside → NotFound', async () => {
    const service = build(null);
    await expect(
      service.getManagedByService('svc-no-si'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SupportInsideAdminService.listEligibleTechnicians — F3·E8', () => {
  function build(opts: {
    users?: Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      avatar_url: string | null;
      role: { slug: string };
    }>;
    presenceMap?: Record<string, string>;
    load?: Array<{ assigned_to: string; _count: { _all: number } }>;
  }) {
    const userFindMany = jest.fn().mockResolvedValue(opts.users ?? []);
    const taskGroupBy = jest.fn().mockResolvedValue(opts.load ?? []);
    const getPresenceMap = jest.fn().mockResolvedValue(opts.presenceMap ?? {});
    const prisma = {
      user: { findMany: userFindMany },
      task: { groupBy: taskGroupBy },
    } as unknown as PrismaService;
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    const presence = {
      getPresence: jest.fn(),
      getPresenceMap,
    } as unknown as PresenceService;
    const service = new SupportInsideAdminService(prisma, events, presence);
    return { service, userFindMany, taskGroupBy, getPresenceMap };
  }

  it('mapea técnicos con presencia + carga de mantenimiento activa', async () => {
    const { service } = build({
      users: [
        {
          id: 'tech-1',
          first_name: 'Luis',
          last_name: 'Ferrer',
          email: 'luis@aelium.com',
          avatar_url: null,
          role: { slug: 'agent_support' },
        },
        {
          id: 'tech-2',
          first_name: 'Marc',
          last_name: 'Oliver',
          email: 'marc@aelium.com',
          avatar_url: 'https://x/a.png',
          role: { slug: 'agent_full' },
        },
      ],
      presenceMap: { 'tech-1': 'online', 'tech-2': 'away' },
      load: [{ assigned_to: 'tech-1', _count: { _all: 3 } }],
    });
    const out = await service.listEligibleTechnicians();
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: 'tech-1',
      first_name: 'Luis',
      last_name: 'Ferrer',
      full_name: 'Luis Ferrer',
      email: 'luis@aelium.com',
      role: 'agent_support',
      avatar_url: null,
      presence: 'online',
      active_maintenance_tasks: 3,
    });
    // tech-2 sin carga → 0; presencia away.
    expect(out[1]).toMatchObject({
      id: 'tech-2',
      presence: 'away',
      active_maintenance_tasks: 0,
    });
  });

  it('sin usuarios elegibles → array vacío (sin consultar presencia/carga)', async () => {
    const { service, getPresenceMap, taskGroupBy } = build({ users: [] });
    const out = await service.listEligibleTechnicians();
    expect(out).toEqual([]);
    expect(getPresenceMap).not.toHaveBeenCalled();
    expect(taskGroupBy).not.toHaveBeenCalled();
  });
});

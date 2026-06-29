import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupportInsideAdminService } from './support-inside-admin.service';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * SupportInsideAdminService.assignTechnician — Rediseño UI F3·E8.
 * Verifica: validación de elegibilidad, reasignación de tareas pending,
 * desasignación (null), not-found y emisión del evento de audit.
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
    const service = new SupportInsideAdminService(prisma, events);
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

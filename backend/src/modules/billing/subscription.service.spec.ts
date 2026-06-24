import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SubscriptionService } from './subscription.service';

/**
 * Tests unit de pause/resume — el foco es HIGH-2 (IDOR, auditoría 2026-06-21): un
 * no-dueño NO puede pausar/reanudar el servicio de otro. El `userId` lo resuelve el
 * controller del JWT (`req.user.id`); aquí se prueba que el servicio rechaza con
 * NotFound (sin filtrar existencia) y NO muta nada cuando el actor no es el dueño.
 */
describe('SubscriptionService — pause/resume (HIGH-2 IDOR)', () => {
  const OWNER = 'user-1';
  let prisma: { service: { findUnique: jest.Mock; update: jest.Mock } };
  let emitter: { emit: jest.Mock };
  let service: SubscriptionService;

  function activeService(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: OWNER,
      status: 'active',
      paused_at: null,
      product: { client_can_pause: true, pause_max_days: 30 },
      ...over,
    };
  }

  function pausedService(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: OWNER,
      status: 'suspended',
      paused_at: new Date(),
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      service: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'svc-1' }),
      },
    };
    emitter = { emit: jest.fn() };
    service = new SubscriptionService(
      prisma as never,
      emitter as unknown as EventEmitter2,
    );
  });

  describe('pauseService', () => {
    it('el dueño pausa su servicio activo (status→suspended + service.paused)', async () => {
      prisma.service.findUnique.mockResolvedValue(activeService());

      await service.pauseService('svc-1', OWNER);

      const updateCalls = prisma.service.update.mock.calls as Array<
        [{ where: { id: string }; data: Record<string, unknown> }]
      >;
      expect(updateCalls[0][0].where).toEqual({ id: 'svc-1' });
      expect(updateCalls[0][0].data.status).toBe('suspended');
      const emitCalls = emitter.emit.mock.calls as Array<
        [string, { service_id: string; user_id: string }]
      >;
      expect(emitCalls[0][0]).toBe('service.paused');
      expect(emitCalls[0][1].user_id).toBe(OWNER);
    });

    it('IDOR: un no-dueño recibe NotFound y NO toca el servicio', async () => {
      prisma.service.findUnique.mockResolvedValue(activeService()); // del OWNER

      await expect(service.pauseService('svc-1', 'attacker')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.service.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('rechaza si el servicio no está activo', async () => {
      prisma.service.findUnique.mockResolvedValue(
        activeService({ status: 'suspended' }),
      );

      await expect(service.pauseService('svc-1', OWNER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza si el producto no permite pausar', async () => {
      prisma.service.findUnique.mockResolvedValue(
        activeService({ product: { client_can_pause: false } }),
      );

      await expect(service.pauseService('svc-1', OWNER)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resumeService', () => {
    it('el dueño reanuda su servicio pausado (status→active + service.resumed)', async () => {
      prisma.service.findUnique.mockResolvedValue(pausedService());

      await service.resumeService('svc-1', OWNER);

      const updateCalls = prisma.service.update.mock.calls as Array<
        [{ where: { id: string }; data: Record<string, unknown> }]
      >;
      expect(updateCalls[0][0].data.status).toBe('active');
      const emitCalls = emitter.emit.mock.calls as Array<
        [string, { service_id: string }]
      >;
      expect(emitCalls[0][0]).toBe('service.resumed');
    });

    it('IDOR: un no-dueño recibe NotFound y NO toca el servicio', async () => {
      prisma.service.findUnique.mockResolvedValue(pausedService());

      await expect(service.resumeService('svc-1', 'attacker')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('rechaza si el servicio no está pausado', async () => {
      prisma.service.findUnique.mockResolvedValue(
        pausedService({ status: 'active', paused_at: null }),
      );

      await expect(service.resumeService('svc-1', OWNER)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

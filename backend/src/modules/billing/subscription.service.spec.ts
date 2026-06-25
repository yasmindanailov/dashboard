import { BadRequestException, NotFoundException } from '@nestjs/common';

import { SubscriptionService } from './subscription.service';

/**
 * Tests unit de pause/resume — el foco es HIGH-2 (IDOR, auditoría 2026-06-21): un
 * no-dueño NO puede pausar/reanudar el servicio de otro. El `userId` lo resuelve el
 * controller del JWT (`req.user.id`); aquí se prueba que el servicio rechaza con
 * NotFound (sin filtrar existencia) y NO muta nada cuando el actor no es el dueño.
 */
describe('SubscriptionService — pause/resume (HIGH-2 IDOR)', () => {
  const OWNER = 'user-1';
  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  // R8 (GL-17): pause/resume persisten su evento `service.*` vía Outbox.
  let outbox: { enqueue: jest.Mock };
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
      // R8 (GL-17): `$transaction(cb)` ejecuta cb con el propio `prisma` como
      // `tx` → `tx.service.update === prisma.service.update` y `outbox.enqueue`
      // se invoca con `(prisma, ...)`.
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionService(prisma as never, outbox as never);
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
      // R8 (GL-17): el evento se persiste vía Outbox dentro de la tx (antes emit),
      // con el payload canónico de `_events.md`. `pause_max_date` es un STRING ISO
      // (no un Date), porque Outbox serializa el payload a JSON.
      const enqueueCalls = outbox.enqueue.mock.calls as Array<
        [
          unknown,
          string,
          { service_id: string; user_id: string; pause_max_date: string },
        ]
      >;
      expect(enqueueCalls[0][1]).toBe('service.paused');
      expect(enqueueCalls[0][2].service_id).toBe('svc-1');
      expect(enqueueCalls[0][2].user_id).toBe(OWNER);
      expect(typeof enqueueCalls[0][2].pause_max_date).toBe('string');
    });

    it('IDOR: un no-dueño recibe NotFound y NO toca el servicio', async () => {
      prisma.service.findUnique.mockResolvedValue(activeService()); // del OWNER

      await expect(service.pauseService('svc-1', 'attacker')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.service.update).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
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
      // R8 (GL-17): payload canónico completo vía Outbox.
      const enqueueCalls = outbox.enqueue.mock.calls as Array<
        [
          unknown,
          string,
          { service_id: string; user_id: string; reason: string },
        ]
      >;
      expect(enqueueCalls[0][1]).toBe('service.resumed');
      expect(enqueueCalls[0][2].service_id).toBe('svc-1');
      expect(enqueueCalls[0][2].user_id).toBe(OWNER);
      expect(enqueueCalls[0][2].reason).toBe('manual_resume');
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

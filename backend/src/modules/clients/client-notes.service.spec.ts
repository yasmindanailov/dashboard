/**
 * Sprint 15C.II Fase G.1.c — F.6: ClientNotesService unit (aislado).
 *
 * Gap cerrado: `createFromServiceLifecycleAction` (el entrypoint F.6 que crean
 * suspend/unsuspend/deprovision/reactivate/reconcile) solo se ejercitaba vía
 * integración de sus callers (`provisioning.service.spec.ts`), nunca en
 * aislamiento. Aquí cubrimos su lógica propia: NoteCategory por defecto vs
 * override, source_system/source_id canónicos, actor sistema (author_id null),
 * y el pass-through de `tx` (la nota encaja en la $transaction del orquestador).
 *
 * Bonus: la validación defensiva de `createExceptional` (NotFound + body vacío).
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NoteCategory, NoteSourceSystem } from '@prisma/client';

import { ClientNotesService } from './client-notes.service';

describe('ClientNotesService — Sprint 15C.II G.1.c (F.6)', () => {
  function buildPrismaMock() {
    const create = jest
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'note-1', ...args.data }),
      );
    return {
      create,
      prisma: {
        clientNote: { create },
        user: { findUnique: jest.fn() },
      },
    };
  }

  function buildService(prisma: unknown): ClientNotesService {
    return new ClientNotesService(prisma as never);
  }

  describe('createFromServiceLifecycleAction', () => {
    const base = {
      user_id: 'user-1',
      author_id: 'admin-1',
      service_id: 'svc-1',
      triggered_by_action: 'service.suspended' as const,
      body: 'Suspendido por impago de la factura INV-2026-001.',
    };

    it('usa NoteCategory.lifecycle por defecto + source_system service + source_id=service_id', async () => {
      const { create, prisma } = buildPrismaMock();
      await buildService(prisma).createFromServiceLifecycleAction(base);

      expect(create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          author_id: 'admin-1',
          category: NoteCategory.lifecycle,
          source_system: NoteSourceSystem.service,
          source_id: 'svc-1',
          triggered_by_action: 'service.suspended',
          body: base.body,
          is_pinned: false,
        },
      });
    });

    it('respeta el override de category (F.9 → reconciliation)', async () => {
      const { create, prisma } = buildPrismaMock();
      await buildService(prisma).createFromServiceLifecycleAction({
        ...base,
        triggered_by_action: 'service.reconciled_single',
        category: NoteCategory.reconciliation,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          author_id: 'admin-1',
          category: NoteCategory.reconciliation,
          source_system: NoteSourceSystem.service,
          source_id: 'svc-1',
          triggered_by_action: 'service.reconciled_single',
          body: base.body,
          is_pinned: false,
        },
      });
    });

    it('acepta author_id null (actor sistema — cron/listener)', async () => {
      const { create, prisma } = buildPrismaMock();
      await buildService(prisma).createFromServiceLifecycleAction({
        ...base,
        author_id: null,
        triggered_by_action: 'service.auto_suspended_overdue',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          author_id: null,
          category: NoteCategory.lifecycle,
          source_system: NoteSourceSystem.service,
          source_id: 'svc-1',
          triggered_by_action: 'service.auto_suspended_overdue',
          body: base.body,
          is_pinned: false,
        },
      });
    });

    it('usa el TransactionClient `tx` cuando se pasa (encaja en la $transaction del orquestador)', async () => {
      const { prisma } = buildPrismaMock();
      const txCreate = jest.fn().mockResolvedValue({ id: 'note-tx' });
      const tx = { clientNote: { create: txCreate } };

      await buildService(prisma).createFromServiceLifecycleAction(
        base,
        tx as never,
      );

      // La nota se crea con el cliente transaccional, NO con el prisma global.
      expect(txCreate).toHaveBeenCalledTimes(1);
      expect(prisma.clientNote.create).not.toHaveBeenCalled();
    });
  });

  describe('createExceptional — validación defensiva', () => {
    it('lanza NotFound si el cliente no existe', async () => {
      const { prisma } = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        buildService(prisma).createExceptional('ghost', 'admin-1', {
          body: 'hola',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza BadRequest si el body está vacío o en blanco', async () => {
      const { prisma } = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

      await expect(
        buildService(prisma).createExceptional('user-1', 'admin-1', {
          body: '   ',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

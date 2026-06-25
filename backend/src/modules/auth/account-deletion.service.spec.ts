import { ConflictException, NotFoundException } from '@nestjs/common';

import { AccountDeletionService } from './account-deletion.service';

/**
 * Tests unit `AccountDeletionService` — audit 2026-06-25 GL-5 / H3b.2.
 *
 * Foco: el lifecycle de la solicitud (request/cancel) + la EJECUCIÓN del
 * borrado, que es soft-delete + anonimización (nunca borrado físico), bloqueada
 * si hay servicios vivos o facturas impagadas (retención legal).
 */
describe('AccountDeletionService — GL-5 / H3b.2', () => {
  const USER = '11111111-1111-1111-1111-111111111111';
  const ADMIN = '22222222-2222-2222-2222-222222222222';
  const REQ = '33333333-3333-3333-3333-333333333333';

  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    accountDeletionRequest: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    service: { count: jest.Mock };
    invoice: { count: jest.Mock };
    clientProfile: { updateMany: jest.Mock };
    session: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    user: { update: jest.Mock };
    clientProfile: { updateMany: jest.Mock };
    session: { updateMany: jest.Mock };
    accountDeletionRequest: { update: jest.Mock };
  };
  let audit: { logChange: jest.Mock };
  let service: AccountDeletionService;

  beforeEach(() => {
    tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      clientProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      accountDeletionRequest: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: USER, anonymized_at: null }),
        update: jest.fn(),
      },
      accountDeletionRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: REQ, user_id: USER, status: 'pending' }),
        create: jest.fn().mockResolvedValue({ id: REQ, status: 'pending' }),
        update: jest.fn().mockResolvedValue({ id: REQ }),
      },
      service: { count: jest.fn().mockResolvedValue(0) },
      invoice: { count: jest.fn().mockResolvedValue(0) },
      clientProfile: { updateMany: jest.fn() },
      session: { updateMany: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    service = new AccountDeletionService(prisma as never, audit as never);
  });

  describe('requestDeletion', () => {
    it('crea una solicitud pending si no hay otra', async () => {
      await service.requestDeletion(USER, '  ya no lo uso  ');

      expect(prisma.accountDeletionRequest.create).toHaveBeenCalledWith({
        data: { user_id: USER, reason: 'ya no lo uso', status: 'pending' },
      });
    });

    it('devuelve la solicitud pending existente (idempotente) sin crear otra', async () => {
      prisma.accountDeletionRequest.findFirst.mockResolvedValueOnce({
        id: REQ,
        status: 'pending',
      });

      const result = await service.requestDeletion(USER);

      expect(prisma.accountDeletionRequest.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: REQ, status: 'pending' });
    });

    it('409 si la cuenta ya está anonimizada', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER,
        anonymized_at: new Date(),
      });

      await expect(service.requestDeletion(USER)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancelMyRequest', () => {
    it('cancela la solicitud pending', async () => {
      prisma.accountDeletionRequest.findFirst.mockResolvedValueOnce({
        id: REQ,
      });

      await service.cancelMyRequest(USER);

      expect(prisma.accountDeletionRequest.update).toHaveBeenCalledWith({
        where: { id: REQ },
        data: { status: 'cancelled' },
      });
    });

    it('404 si no hay solicitud pending', async () => {
      prisma.accountDeletionRequest.findFirst.mockResolvedValueOnce(null);
      await expect(service.cancelMyRequest(USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('rejectRequest', () => {
    it('marca rejected + audita', async () => {
      await service.rejectRequest(REQ, ADMIN, 'datos incompletos');

      const rejData = (
        prisma.accountDeletionRequest.update.mock.calls as Array<
          [
            {
              where: { id: string };
              data: {
                status: string;
                reviewed_by_id: string;
                review_note: string;
              };
            },
          ]
        >
      )[0][0];
      expect(rejData.where.id).toBe(REQ);
      expect(rejData.data.status).toBe('rejected');
      expect(rejData.data.reviewed_by_id).toBe(ADMIN);
      expect(rejData.data.review_note).toBe('datos incompletos');
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deletion_request_rejected' }),
      );
    });

    it('409 si la solicitud no está pending', async () => {
      prisma.accountDeletionRequest.findUnique.mockResolvedValueOnce({
        id: REQ,
        user_id: USER,
        status: 'completed',
      });
      await expect(
        service.rejectRequest(REQ, ADMIN, 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('executeRequest — anonimización', () => {
    it('BLOQUEA si hay servicios vivos (no anonimiza)', async () => {
      prisma.service.count.mockResolvedValueOnce(2);

      await expect(service.executeRequest(REQ, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('BLOQUEA si hay facturas impagadas (no anonimiza)', async () => {
      prisma.invoice.count.mockResolvedValueOnce(1);

      await expect(service.executeRequest(REQ, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409 si la cuenta ya estaba anonimizada', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER,
        anonymized_at: new Date(),
      });
      await expect(service.executeRequest(REQ, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('anonimiza User + ClientProfile + revoca sesiones + cierra la solicitud + audita', async () => {
      const result = await service.executeRequest(REQ, ADMIN);

      // 1) User: identidad borrada + inactive + anonymized_at + secretos limpios.
      const userData = (
        tx.user.update.mock.calls as Array<[{ data: Record<string, unknown> }]>
      )[0][0].data;
      expect(userData.email).toBe(`deleted-${USER}@anonymized.invalid`);
      expect(userData.status).toBe('inactive');
      expect(userData.password_hash).toBe('ANONYMIZED');
      expect(userData.two_factor_secret).toBeNull();
      expect(userData.anonymized_at).toBeInstanceOf(Date);

      // 2) ClientProfile: PII a null.
      const cpArg = (
        tx.clientProfile.updateMany.mock.calls as Array<
          [{ where: { user_id: string }; data: Record<string, unknown> }]
        >
      )[0][0];
      expect(cpArg.where.user_id).toBe(USER);
      expect(cpArg.data.tax_id).toBeNull();
      expect(cpArg.data.phone).toBeNull();

      // 3) Sesiones revocadas.
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER, is_active: true },
          data: { is_active: false, revoked_reason: 'account_anonymized' },
        }),
      );

      // 4) Solicitud completed.
      const reqData = (
        tx.accountDeletionRequest.update.mock.calls as Array<
          [{ where: { id: string }; data: { status: string } }]
        >
      )[0][0];
      expect(reqData.where.id).toBe(REQ);
      expect(reqData.data.status).toBe('completed');

      // 5) Audit R3 de la anonimización.
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'User',
          entity_id: USER,
          action: 'account_anonymized',
        }),
      );

      expect(result.ok).toBe(true);
    });
  });
});

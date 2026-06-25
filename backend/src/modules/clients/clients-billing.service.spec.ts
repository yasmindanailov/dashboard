import { NotFoundException, BadRequestException } from '@nestjs/common';

import { ClientsBillingService } from './clients-billing.service';
import { PrismaService } from '../../core/database/prisma.service';
import { UpdateBillingProfileDto } from './dto/billing-profile.dto';

/**
 * Specs de ClientsBillingService (audit 2026-06-25):
 *  - GL-8: integridad fiscal — borrar un perfil vinculado a facturas debe
 *    ARCHIVARLO (preservar el snapshot fiscal), no borrarlo; sin facturas,
 *    borrado físico.
 *  - GL-26: el guard anti-IDOR (profile.user_id !== userId → NotFound) no
 *    tenía ninguna prueba; aquí se cubre en delete/update/setDefault.
 */
describe('ClientsBillingService — ownership + integridad fiscal (GL-8 / anti-IDOR GL-26)', () => {
  let service: ClientsBillingService;
  let billingFindUnique: jest.Mock;
  let billingFindMany: jest.Mock;
  let billingDelete: jest.Mock;
  let billingUpdate: jest.Mock;
  let invoiceCount: jest.Mock;

  beforeEach(() => {
    billingFindUnique = jest.fn();
    billingFindMany = jest.fn().mockResolvedValue([]);
    billingDelete = jest.fn().mockResolvedValue({});
    billingUpdate = jest.fn().mockResolvedValue({});
    invoiceCount = jest.fn();

    const prisma = {
      billingProfile: {
        findUnique: billingFindUnique,
        findMany: billingFindMany,
        delete: billingDelete,
        update: billingUpdate,
      },
      invoice: { count: invoiceCount },
    } as unknown as PrismaService;

    service = new ClientsBillingService(prisma);
  });

  describe('getBillingProfiles', () => {
    it('excluye los perfiles archivados de la lista activa', async () => {
      await service.getBillingProfiles('u1');
      expect(billingFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'u1', is_archived: false },
        }),
      );
    });
  });

  describe('deleteBillingProfile', () => {
    it('rechaza (NotFound) un perfil de otro usuario — anti-IDOR', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'OTRO-USER',
        is_default: false,
        is_archived: false,
      });

      await expect(service.deleteBillingProfile('u1', 'p1')).rejects.toThrow(
        NotFoundException,
      );
      expect(billingDelete).not.toHaveBeenCalled();
      expect(invoiceCount).not.toHaveBeenCalled();
    });

    it('rechaza borrar el perfil por defecto', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        is_default: true,
        is_archived: false,
      });

      await expect(service.deleteBillingProfile('u1', 'p1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ARCHIVA (no borra) si hay facturas vinculadas — preserva el snapshot fiscal', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        is_default: false,
        is_archived: false,
      });
      invoiceCount.mockResolvedValue(3);

      await service.deleteBillingProfile('u1', 'p1');

      expect(billingDelete).not.toHaveBeenCalled();
      expect(billingUpdate).toHaveBeenCalledTimes(1);
      const updateCalls = billingUpdate.mock.calls as Array<
        [
          {
            where: { id: string };
            data: { is_archived: boolean; archived_at: Date };
          },
        ]
      >;
      const updateArg = updateCalls[0][0];
      expect(updateArg.where).toEqual({ id: 'p1' });
      expect(updateArg.data.is_archived).toBe(true);
      expect(updateArg.data.archived_at).toBeInstanceOf(Date);
    });

    it('BORRA físicamente si no hay facturas vinculadas', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        is_default: false,
        is_archived: false,
      });
      invoiceCount.mockResolvedValue(0);

      await service.deleteBillingProfile('u1', 'p1');

      expect(billingDelete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(billingUpdate).not.toHaveBeenCalled();
    });

    it('trata un perfil ya archivado como inexistente', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        is_default: false,
        is_archived: true,
      });

      await expect(service.deleteBillingProfile('u1', 'p1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setDefault / update — anti-IDOR + archivado', () => {
    it('setDefault rechaza un perfil de otro usuario', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'OTRO-USER',
        is_archived: false,
      });

      await expect(
        service.setDefaultBillingProfile('u1', 'p1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('update rechaza un perfil archivado', async () => {
      billingFindUnique.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        is_archived: true,
        type: 'particular',
      });

      await expect(
        service.updateBillingProfile('u1', 'p1', {} as UpdateBillingProfileDto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

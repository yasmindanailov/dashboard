import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
}));

/**
 * Tests unit `UsersService` — GL-21 (audit 2026-06-25 §6 Tier 3): gestión de
 * cuentas staff. Foco en las invariantes de seguridad (las que hacen que el
 * offboarding sea seguro): auto-protección, último superadmin activo intocable,
 * baja = inactive + revocación de sesiones, audit R3 en cada cambio.
 */
describe('UsersService — GL-21 gestión de staff', () => {
  const ADMIN = '11111111-1111-1111-1111-111111111111'; // superadmin que actúa
  const AGENT = '22222222-2222-2222-2222-222222222222';
  const SUPER2 = '33333333-3333-3333-3333-333333333333'; // segundo superadmin

  type Row = Record<string, unknown>;
  const staffRow = (over: Row = {}): Row => ({
    id: AGENT,
    email: 'agente@aelium.net',
    first_name: 'Ana',
    last_name: 'Agente',
    status: 'active',
    two_factor_enabled: false,
    last_login_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    avatar_url: null,
    anonymized_at: null,
    role: { slug: 'agent_full' },
    ...over,
  });

  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    session: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: { user: { update: jest.Mock }; session: { updateMany: jest.Mock } };
  let audit: { logChange: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(staffRow()),
        findMany: jest.fn().mockResolvedValue([staffRow()]),
        create: jest.fn().mockResolvedValue(staffRow({ id: 'new-id' })),
        update: jest.fn().mockResolvedValue(staffRow()),
        count: jest.fn().mockResolvedValue(1),
      },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-id' }) },
      session: { updateMany: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    service = new UsersService(prisma as never, audit as never);
  });

  describe('createStaff', () => {
    it('lowercasea el email, hashea, crea active+verificado y audita', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // sin conflicto de email

      await service.createStaff(
        {
          email: '  Nuevo.Agente@Aelium.NET ',
          first_name: 'Nuevo',
          last_name: 'Agente',
          role: 'agent_support',
          password: 'TempPass1',
        } as never,
        ADMIN,
      );

      const createArg = (
        prisma.user.create.mock.calls as Array<[{ data: Row }]>
      )[0][0].data;
      expect(createArg.email).toBe('nuevo.agente@aelium.net');
      expect(createArg.password_hash).toBe('hashed-pw');
      expect(createArg.status).toBe('active');
      expect(createArg.email_verified_at).toBeInstanceOf(Date);
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'User',
          action: 'staff_created',
          user_id: ADMIN,
        }),
      );
    });

    it('409 si el email ya existe', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.createStaff(
          {
            email: 'dup@aelium.net',
            first_name: 'X',
            last_name: 'Y',
            role: 'agent_full',
            password: 'TempPass1',
          } as never,
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStaff', () => {
    it('bloquea cambiar el propio rol (auto-protección)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ id: ADMIN, role: { slug: 'superadmin' } }),
      );
      await expect(
        service.updateStaff(ADMIN, { role: 'agent_full' } as never, ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('bloquea degradar al último superadmin activo', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({
          id: SUPER2,
          status: 'active',
          role: { slug: 'superadmin' },
        }),
      );
      prisma.user.count.mockResolvedValueOnce(1); // solo queda 1 superadmin activo
      await expect(
        service.updateStaff(SUPER2, { role: 'agent_full' } as never, ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('permite degradar un superadmin si hay otro activo + audita', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({
          id: SUPER2,
          status: 'active',
          role: { slug: 'superadmin' },
        }),
      );
      prisma.user.count.mockResolvedValueOnce(2);

      await service.updateStaff(SUPER2, { role: 'agent_full' } as never, ADMIN);

      expect(prisma.user.update).toHaveBeenCalled();
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff_updated', entity_id: SUPER2 }),
      );
    });

    it('404 si el id no es una cuenta de staff', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ role: { slug: 'client' } }),
      );
      await expect(
        service.updateStaff(AGENT, { first_name: 'Z' } as never, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no escribe ni audita si no hay cambios reales', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(staffRow());
      await service.updateStaff(
        AGENT,
        { first_name: 'Ana', last_name: 'Agente' } as never,
        ADMIN,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.logChange).not.toHaveBeenCalled();
    });
  });

  describe('setStaffStatus', () => {
    it('bloquea desactivar la propia cuenta', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ id: ADMIN, role: { slug: 'superadmin' } }),
      );
      await expect(
        service.setStaffStatus(ADMIN, 'inactive' as never, ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('bloquea desactivar al último superadmin activo', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({
          id: SUPER2,
          status: 'active',
          role: { slug: 'superadmin' },
        }),
      );
      prisma.user.count.mockResolvedValueOnce(1);
      await expect(
        service.setStaffStatus(SUPER2, 'inactive' as never, ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('baja = inactive + revoca sesiones (en tx) + audita', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ status: 'active' }),
      );

      await service.setStaffStatus(AGENT, 'inactive' as never, ADMIN);

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: AGENT },
          data: { status: 'inactive' },
        }),
      );
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: AGENT, is_active: true },
          data: { is_active: false, revoked_reason: 'staff_deactivated' },
        }),
      );
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'staff_deactivated',
          entity_id: AGENT,
        }),
      );
    });

    it('no reactiva una cuenta anonimizada', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ status: 'inactive', anonymized_at: new Date() }),
      );
      await expect(
        service.setStaffStatus(AGENT, 'active' as never, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reactiva una cuenta inactiva + audita', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ status: 'inactive' }),
      );
      await service.setStaffStatus(AGENT, 'active' as never, ADMIN);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: AGENT },
          data: { status: 'active' },
        }),
      );
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff_reactivated' }),
      );
    });

    it('idempotente: sin cambio de estado no escribe ni audita', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ status: 'active' }),
      );
      await service.setStaffStatus(AGENT, 'active' as never, ADMIN);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.logChange).not.toHaveBeenCalled();
    });
  });

  describe('getStaff', () => {
    it('404 si el id no es staff', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        staffRow({ role: { slug: 'partner' } }),
      );
      await expect(service.getStaff(AGENT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

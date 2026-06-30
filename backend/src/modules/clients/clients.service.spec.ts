import { NotFoundException } from '@nestjs/common';

import { ClientsService } from './clients.service';

/**
 * Tests unit `ClientsService.setAccountSuspended` — F4·U22 (acción "Suspender
 * cuenta" del detalle de cliente). Toggle `User.status` active↔blocked,
 * idempotente, solo clientes, auditado (R3).
 */
describe('ClientsService.setAccountSuspended', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let audit: { logChange: jest.Mock };
  let service: ClientsService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    service = new ClientsService(
      prisma as never,
      {} as never,
      {} as never,
      audit as never,
    );
  });

  it('usuario inexistente → NotFoundException', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.setAccountSuspended('u-x', true, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('usuario no-cliente (staff) → NotFoundException', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      status: 'active',
      role: { slug: 'agent_support' },
    });
    await expect(
      service.setAccountSuspended('u1', true, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('suspender (active → blocked) actualiza y audita', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      status: 'active',
      role: { slug: 'client' },
    });
    prisma.user.update.mockResolvedValueOnce({ id: 'u1', status: 'blocked' });

    const res = await service.setAccountSuspended('u1', true, 'admin-1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { status: 'blocked' },
      }),
    );
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-1',
        entity_type: 'User',
        entity_id: 'u1',
        action: 'client.account_suspended',
      }),
    );
    expect(res).toEqual({ id: 'u1', status: 'blocked' });
  });

  it('idempotente: ya blocked y se pide suspender → ni update ni audit', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      status: 'blocked',
      role: { slug: 'client' },
    });
    const res = await service.setAccountSuspended('u1', true, 'admin-1');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audit.logChange).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'u1', status: 'blocked' });
  });

  it('reactivar (blocked → active) audita con action reactivated', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      status: 'blocked',
      role: { slug: 'client' },
    });
    prisma.user.update.mockResolvedValueOnce({ id: 'u1', status: 'active' });

    await service.setAccountSuspended('u1', false, 'admin-1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'active' } }),
    );
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client.account_reactivated' }),
    );
  });
});

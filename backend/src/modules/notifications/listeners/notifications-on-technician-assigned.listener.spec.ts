import { NotificationsOnTechnicianAssignedListener } from './notifications-on-technician-assigned.listener';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnTechnicianAssignedListener — F3·E8 admin.
 * Verifica: notifica al NUEVO técnico con el nombre del cliente; no notifica
 * en desasignación (null); fail-soft.
 */
describe('NotificationsOnTechnicianAssignedListener — F3·E8', () => {
  function build(
    client: { first_name: string; last_name: string; email: string } | null,
  ) {
    const dispatchToUser = jest.fn().mockResolvedValue(undefined);
    const findUnique = jest.fn().mockResolvedValue(client);
    const notifications = { dispatchToUser } as unknown as NotificationsService;
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    return {
      listener: new NotificationsOnTechnicianAssignedListener(
        notifications,
        prisma,
      ),
      dispatchToUser,
      findUnique,
    };
  }

  const base = {
    subscription_id: 'sub-1',
    client_id: 'client-1',
    previous_technician_id: null,
    reassigned_pending_tasks: 0,
  };

  it('despacha campana al nuevo técnico con el nombre del cliente', async () => {
    const { listener, dispatchToUser } = build({
      first_name: 'Sara',
      last_name: 'Gómez',
      email: 'sara@x.com',
    });
    await listener.handleTechnicianAssigned({
      ...base,
      technician_id: 'tech-1',
    });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'support_inside.technician_assigned',
      { client_name: 'Sara Gómez' },
      'tech-1',
    );
  });

  it('desasignación (technician_id=null) → no notifica', async () => {
    const { listener, dispatchToUser, findUnique } = build(null);
    await listener.handleTechnicianAssigned({ ...base, technician_id: null });
    expect(dispatchToUser).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('fail-soft: un fallo del dispatch no propaga', async () => {
    const { listener, dispatchToUser } = build({
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.com',
    });
    dispatchToUser.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      listener.handleTechnicianAssigned({ ...base, technician_id: 'tech-1' }),
    ).resolves.toBeUndefined();
  });
});

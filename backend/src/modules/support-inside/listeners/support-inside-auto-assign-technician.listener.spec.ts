import { SupportInsideAutoAssignTechnicianListener } from './support-inside-auto-assign-technician.listener';
import { PrismaService } from '../../../core/database/prisma.service';
import { SupportInsideAdminService } from '../support-inside-admin.service';

/**
 * SupportInsideAutoAssignTechnicianListener — F3·E8 (auto-asignar al contratar).
 * Verifica: auto-asigna por menor carga si no hay técnico; respeta técnico
 * existente; sin agentes → no asigna; fail-soft.
 */
describe('SupportInsideAutoAssignTechnicianListener — F3·E8', () => {
  function build(opts: {
    subscription?: {
      status: string;
      assigned_technician_id: string | null;
    } | null;
    autoAssignRows?: Array<{ id: string }>;
  }) {
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        opts.subscription === undefined
          ? { status: 'active', assigned_technician_id: null }
          : opts.subscription,
      );
    // `autoAssignTask` (real) usa prisma.$queryRaw → devolvemos el agente elegido.
    const $queryRaw = jest
      .fn()
      .mockResolvedValue(opts.autoAssignRows ?? [{ id: 'tech-1' }]);
    const assignTechnician = jest.fn().mockResolvedValue({});
    const prisma = {
      supportInsideSubscription: { findUnique },
      $queryRaw,
    } as unknown as PrismaService;
    const admin = { assignTechnician } as unknown as SupportInsideAdminService;
    return {
      listener: new SupportInsideAutoAssignTechnicianListener(prisma, admin),
      assignTechnician,
    };
  }

  const payload = {
    subscription_id: 'sub-1',
    client_id: 'client-1',
    product_id: 'prod-1',
    service_id: 'svc-1',
  };

  it('auto-asigna el técnico de menor carga si la suscripción no tiene', async () => {
    const { listener, assignTechnician } = build({});
    await listener.handleSubscribed(payload);
    expect(assignTechnician).toHaveBeenCalledWith('sub-1', 'tech-1');
  });

  it('respeta un técnico ya asignado (no reasigna)', async () => {
    const { listener, assignTechnician } = build({
      subscription: { status: 'active', assigned_technician_id: 'existing' },
    });
    await listener.handleSubscribed(payload);
    expect(assignTechnician).not.toHaveBeenCalled();
  });

  it('suscripción no activa → no asigna', async () => {
    const { listener, assignTechnician } = build({
      subscription: { status: 'cancelled', assigned_technician_id: null },
    });
    await listener.handleSubscribed(payload);
    expect(assignTechnician).not.toHaveBeenCalled();
  });

  it('sin agentes elegibles → no asigna (queda sin técnico)', async () => {
    const { listener, assignTechnician } = build({ autoAssignRows: [] });
    await listener.handleSubscribed(payload);
    expect(assignTechnician).not.toHaveBeenCalled();
  });

  it('fail-soft: un fallo de assignTechnician no propaga', async () => {
    const { listener, assignTechnician } = build({});
    assignTechnician.mockRejectedValueOnce(new Error('db down'));
    await expect(listener.handleSubscribed(payload)).resolves.toBeUndefined();
  });
});

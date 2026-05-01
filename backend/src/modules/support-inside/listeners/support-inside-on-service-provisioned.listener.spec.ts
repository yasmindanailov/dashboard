import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { SupportInsideOnServiceProvisionedListener } from './support-inside-on-service-provisioned.listener';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Tests unit SupportInsideOnServiceProvisionedListener — Sub-fase 8.D.12.9 (ADR-076).
 *
 * Cobertura:
 *   - Filtro defensivo: product_type !== 'support_inside' → no actúa (EC-T8-50).
 *   - Sin subscription previa → create.
 *   - Subscription cancelled previa → reactivate (update).
 *   - Re-emite support_inside.subscribed con shape correcto.
 *   - P2002 race condition → degradación silenciosa (no relanza).
 */
describe('SupportInsideOnServiceProvisionedListener — Sprint 8 Fase D.12.9', () => {
  let listener: SupportInsideOnServiceProvisionedListener;
  let prisma: {
    supportInsideSubscription: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let events: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      supportInsideSubscription: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    events = { emit: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportInsideOnServiceProvisionedListener,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    listener = module.get(SupportInsideOnServiceProvisionedListener);
  });

  it('NO actúa si product_type !== support_inside (EC-T8-50)', async () => {
    await listener.handleServiceProvisioned({
      service_id: 'SV1',
      user_id: 'U1',
      product_id: 'P1',
      product_type: 'hosting_web',
      product_pricing_id: 'PR1',
      invoice_id: 'I1',
    });
    expect(prisma.supportInsideSubscription.findUnique).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('sin subscription previa → create + emit support_inside.subscribed', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);
    prisma.supportInsideSubscription.create.mockResolvedValue({ id: 'S1' });

    await listener.handleServiceProvisioned({
      service_id: 'SV1',
      user_id: 'U1',
      product_id: 'P1',
      product_type: 'support_inside',
      product_pricing_id: 'PR1',
      invoice_id: 'I1',
    });

    expect(prisma.supportInsideSubscription.create).toHaveBeenCalledWith({
      data: {
        client_id: 'U1',
        product_id: 'P1',
        service_id: 'SV1',
        status: 'active',
      },
    });
    expect(prisma.supportInsideSubscription.update).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith('support_inside.subscribed', {
      subscription_id: 'S1',
      client_id: 'U1',
      product_id: 'P1',
      service_id: 'SV1',
    });
  });

  it('subscription cancelled previa → update reactivate (no create)', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: 'S1',
      status: 'cancelled',
    });
    prisma.supportInsideSubscription.update.mockResolvedValue({ id: 'S1' });

    await listener.handleServiceProvisioned({
      service_id: 'SV2',
      user_id: 'U1',
      product_id: 'P2',
      product_type: 'support_inside',
      product_pricing_id: 'PR2',
      invoice_id: 'I2',
    });

    expect(prisma.supportInsideSubscription.update).toHaveBeenCalled();
    const allCalls = prisma.supportInsideSubscription.update.mock
      .calls as unknown as Array<
      [
        {
          where: { client_id: string };
          data: {
            status: string;
            product_id: string;
            service_id: string;
            cancelled_at: Date | null;
          };
        },
      ]
    >;
    const updateCall = allCalls[0][0];
    expect(updateCall.where).toEqual({ client_id: 'U1' });
    expect(updateCall.data.status).toBe('active');
    expect(updateCall.data.product_id).toBe('P2');
    expect(updateCall.data.service_id).toBe('SV2');
    expect(updateCall.data.cancelled_at).toBeNull();

    expect(prisma.supportInsideSubscription.create).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.subscribed',
      expect.any(Object),
    );
  });

  it('P2002 race condition → no relanza (idempotencia degradada)', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.0.0' },
    );
    prisma.supportInsideSubscription.create.mockRejectedValue(p2002);

    await expect(
      listener.handleServiceProvisioned({
        service_id: 'SV1',
        user_id: 'U1',
        product_id: 'P1',
        product_type: 'support_inside',
        product_pricing_id: 'PR1',
        invoice_id: 'I1',
      }),
    ).resolves.not.toThrow();
  });
});

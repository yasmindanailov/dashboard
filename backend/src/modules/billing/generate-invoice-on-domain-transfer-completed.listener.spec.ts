import { GenerateInvoiceOnDomainTransferCompletedListener } from './generate-invoice-on-domain-transfer-completed.listener';

/**
 * Tests unit del listener de cobro AL COMPLETAR de transfer-in (15D.II.T2c.2).
 * Verifica: genera la factura con `service.amount` (precio snapshotado por el
 * checkout); idempotencia (no duplica si ya hay factura abierta); service
 * inexistente → no factura; best-effort (un fallo de facturación no propaga).
 */
describe('GenerateInvoiceOnDomainTransferCompletedListener — 15D.II.T2c.2', () => {
  let prisma: {
    service: { findUnique: jest.Mock };
    invoice: { findFirst: jest.Mock };
  };
  let billing: { createInvoice: jest.Mock };
  let listener: GenerateInvoiceOnDomainTransferCompletedListener;

  function svc(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-dom',
      billing_profile_id: 'bp-1',
      currency: 'EUR',
      amount: 12.99,
      domain: 'movein.com',
      label: 'movein.com',
      next_due_date: new Date('2027-07-01T00:00:00.000Z'),
      product: { name: 'Dominio .com' },
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      service: { findUnique: jest.fn() },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    billing = { createInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }) };
    listener = new GenerateInvoiceOnDomainTransferCompletedListener(
      prisma as never,
      billing as never,
    );
  });

  const payload = {
    service_id: 'svc-1',
    user_id: 'user-1',
    fqdn: 'movein.com',
  };

  it('genera la factura del transfer con service.amount (cobro al completar)', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());

    await listener.handle(payload);

    expect(billing.createInvoice).toHaveBeenCalledTimes(1);
    const calls = billing.createInvoice.mock.calls as Array<
      [
        {
          user_id: string;
          currency: string;
          items: Array<{ service_id: string; unit_price: number }>;
        },
      ]
    >;
    const dto = calls[0][0];
    expect(dto.user_id).toBe('user-1');
    expect(dto.currency).toBe('EUR');
    expect(dto.items[0].service_id).toBe('svc-1');
    expect(dto.items[0].unit_price).toBe(12.99);
  });

  it('idempotente: si ya hay factura draft/pending para el servicio → NO duplica', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());
    prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-existing' });

    await listener.handle(payload);

    expect(billing.createInvoice).not.toHaveBeenCalled();
  });

  it('service no encontrado → no factura', async () => {
    prisma.service.findUnique.mockResolvedValue(null);

    await listener.handle(payload);

    expect(billing.createInvoice).not.toHaveBeenCalled();
  });

  it('best-effort: un fallo de createInvoice NO propaga (el dominio ya está activo)', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());
    billing.createInvoice.mockRejectedValue(new Error('billing down'));

    await expect(listener.handle(payload)).resolves.toBeUndefined();
  });
});

import { Logger } from '@nestjs/common';

import { GenerateInvoiceOnDomainRestoredListener } from './generate-invoice-on-domain-restored.listener';

/**
 * Tests unit del listener de cobro del restore RGP (15D.II.R). Verifica: factura
 * con el fee del evento (resuelto server-side por el admin service); idempotencia
 * (no duplica si ya hay factura de restore); service inexistente → no factura;
 * best-effort (un fallo de facturación no propaga).
 */
describe('GenerateInvoiceOnDomainRestoredListener — 15D.II.R', () => {
  let prisma: {
    service: { findUnique: jest.Mock };
    invoice: { findFirst: jest.Mock };
  };
  let billing: { createInvoice: jest.Mock };
  let listener: GenerateInvoiceOnDomainRestoredListener;

  function svc(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-dom',
      billing_profile_id: 'bp-1',
      currency: 'EUR',
      domain: 'movein.com',
      next_due_date: null,
      product: { name: 'Dominio .com' },
      ...over,
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    prisma = {
      service: { findUnique: jest.fn() },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    billing = { createInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }) };
    listener = new GenerateInvoiceOnDomainRestoredListener(
      prisma as never,
      billing as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const payload = {
    service_id: 'svc-1',
    user_id: 'user-1',
    fqdn: 'movein.com',
    amount: 90,
    currency: 'EUR',
  };

  it('genera la factura del restore con el fee del evento', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());

    await listener.handle(payload);

    expect(billing.createInvoice).toHaveBeenCalledTimes(1);
    const calls = billing.createInvoice.mock.calls as Array<
      [
        {
          currency: string;
          items: Array<{
            service_id: string;
            unit_price: number;
            description: string;
          }>;
        },
      ]
    >;
    const dto = calls[0][0];
    expect(dto.currency).toBe('EUR');
    expect(dto.items[0].service_id).toBe('svc-1');
    expect(dto.items[0].unit_price).toBe(90);
    // El marcador de restore distingue la factura del posible cobro de renovación.
    expect(dto.items[0].description).toMatch(/restauración RGP/);
  });

  it('idempotente: si ya hay factura de restore para el servicio → NO duplica', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());
    prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-existing' });

    await listener.handle(payload);

    expect(billing.createInvoice).not.toHaveBeenCalled();
    // La idempotencia filtra por el marcador de restore en la descripción.
    const calls = prisma.invoice.findFirst.mock.calls as Array<
      [{ where: { items: { some: { description: { contains: string } } } } }]
    >;
    expect(calls[0][0].where.items.some.description.contains).toMatch(
      /restauración RGP/,
    );
  });

  it('service no encontrado → no factura', async () => {
    prisma.service.findUnique.mockResolvedValue(null);
    await listener.handle(payload);
    expect(billing.createInvoice).not.toHaveBeenCalled();
  });

  it('best-effort: un fallo de createInvoice NO propaga (el dominio ya está restaurado)', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());
    billing.createInvoice.mockRejectedValue(new Error('billing down'));
    await expect(listener.handle(payload)).resolves.toBeUndefined();
  });
});

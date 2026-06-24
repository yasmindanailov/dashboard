import { GenerateInvoiceOnPlanChangedListener } from './generate-invoice-on-plan-changed.listener';

/**
 * Tests unit del listener de la factura de prorrateo (ADR-029). Verifica: genera
 * la factura con `amount_to_pay` y las fechas de período del payload; NO factura si
 * el crédito lo cubre todo (`amount_to_pay ≤ 0`); idempotencia (no duplica si ya hay
 * factura abierta); service inexistente → no factura; best-effort (no propaga).
 */
describe('GenerateInvoiceOnPlanChangedListener — ADR-029', () => {
  let prisma: {
    service: { findUnique: jest.Mock };
    invoice: { findFirst: jest.Mock };
  };
  let billing: { createInvoice: jest.Mock };
  let listener: GenerateInvoiceOnPlanChangedListener;

  function svc(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-web',
      billing_profile_id: 'bp-1',
      currency: 'EUR',
      product: { name: 'Web Pro' },
      ...over,
    };
  }

  const payload = {
    service_id: 'svc-1',
    user_id: 'user-1',
    amount_to_pay: 285,
    period_start: '2026-06-24T00:00:00.000Z',
    period_end: '2027-06-24T00:00:00.000Z',
  };

  beforeEach(() => {
    prisma = {
      service: { findUnique: jest.fn() },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    billing = { createInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }) };
    listener = new GenerateInvoiceOnPlanChangedListener(
      prisma as never,
      billing as never,
    );
  });

  it('genera la factura del prorrateo con amount_to_pay y el período del payload', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());

    await listener.handle(payload);

    expect(billing.createInvoice).toHaveBeenCalledTimes(1);
    const calls = billing.createInvoice.mock.calls as Array<
      [
        {
          user_id: string;
          currency: string;
          items: Array<{
            service_id: string;
            unit_price: number;
            period_start?: string;
            period_end?: string;
          }>;
        },
      ]
    >;
    const dto = calls[0][0];
    expect(dto.user_id).toBe('user-1');
    expect(dto.currency).toBe('EUR');
    expect(dto.items[0].service_id).toBe('svc-1');
    expect(dto.items[0].unit_price).toBe(285);
    expect(dto.items[0].period_start).toBe(payload.period_start);
    expect(dto.items[0].period_end).toBe(payload.period_end);
  });

  it('crédito cubre el cambio (amount_to_pay = 0) → NO se crea factura', async () => {
    await listener.handle({ ...payload, amount_to_pay: 0 });

    expect(prisma.service.findUnique).not.toHaveBeenCalled();
    expect(billing.createInvoice).not.toHaveBeenCalled();
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

  it('best-effort: un fallo de createInvoice NO propaga (el service ya está en el nuevo plan)', async () => {
    prisma.service.findUnique.mockResolvedValue(svc());
    billing.createInvoice.mockRejectedValue(new Error('billing down'));

    await expect(listener.handle(payload)).resolves.toBeUndefined();
  });
});

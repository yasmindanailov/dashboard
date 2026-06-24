import { BadRequestException, NotFoundException } from '@nestjs/common';

import { BillingCalculatorService } from './billing-calculator.service';
import { SubscriptionPlanChangeService } from './subscription-plan-change.service';

/**
 * Tests unit de `confirmPlanChange` (ADR-029) — la lógica sensible (mueve dinero).
 * Cubre las restricciones (mismo producto, cambio de ciclo, misma moneda, activo,
 * ownership) y el cableado del cambio: actualiza el service al nuevo plan + acumula
 * el sobrante en `credit_balance_eur` + emite `service.plan_changed` (Outbox) + audita.
 * Usa la calculadora REAL para que la matemática del prorrateo sea la de producción.
 */
describe('SubscriptionPlanChangeService.confirmPlanChange (ADR-029)', () => {
  const realCalc = new BillingCalculatorService(null as never);

  let prisma: {
    service: { findUnique: jest.Mock };
    productPricing: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let txUpdate: jest.Mock;
  let outbox: { enqueue: jest.Mock };
  let audit: { logChange: jest.Mock };
  let service: SubscriptionPlanChangeService;

  /** Service mensual a 30€, 15 días consumidos del ciclo (next_due_date = hoy+15d). */
  function monthlyService(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-web',
      billing_profile_id: 'bp-1',
      status: 'active',
      billing_cycle: 'monthly',
      amount: 30,
      currency: 'EUR',
      next_due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      ...over,
    };
  }

  function annualPricing(over: Record<string, unknown> = {}) {
    return {
      id: 'pr-annual',
      product_id: 'prod-web',
      billing_cycle: 'annual',
      price: 300,
      currency: 'EUR',
      discount_percentage: null,
      ...over,
    };
  }

  beforeEach(() => {
    txUpdate = jest
      .fn()
      .mockResolvedValue({ id: 'svc-1', billing_cycle: 'annual' });
    prisma = {
      service: { findUnique: jest.fn() },
      productPricing: { findUnique: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) =>
          cb({ service: { update: txUpdate } }),
        ),
    };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    const billing = {
      getCycleDays: (c: string) => realCalc.getCycleDays(c),
      calculateProration: (
        p: Parameters<typeof realCalc.calculateProration>[0],
      ) => realCalc.calculateProration(p),
    };
    service = new SubscriptionPlanChangeService(
      prisma as never,
      billing as never,
      outbox as never,
      audit as never,
    );
  });

  it('upgrade mensual→anual: actualiza el plan, emite service.plan_changed (Outbox) y audita; cobra el prorrateo', async () => {
    prisma.service.findUnique.mockResolvedValue(monthlyService());
    prisma.productPricing.findUnique.mockResolvedValue(annualPricing());

    const res = await service.confirmPlanChange(
      'svc-1',
      'pr-annual',
      'user-1',
      false,
    );

    // Service → nuevo plan + sobrante 0 (upgrade).
    const updateCalls = txUpdate.mock.calls as Array<
      [{ where: { id: string }; data: Record<string, unknown> }]
    >;
    const updateArg = updateCalls[0][0];
    expect(updateArg.where).toEqual({ id: 'svc-1' });
    expect(updateArg.data.billing_cycle).toBe('annual');
    expect(updateArg.data.amount).toBe(300);
    expect(updateArg.data.credit_balance_eur).toEqual({ increment: 0 });

    // Evento Outbox con el desglose recalculado server-side (crédito 15€ por 15 días).
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    const enqueueCalls = outbox.enqueue.mock.calls as Array<
      [unknown, string, Record<string, number | string>]
    >;
    const [, eventType, payload] = enqueueCalls[0];
    expect(eventType).toBe('service.plan_changed');
    expect(payload.old_billing_cycle).toBe('monthly');
    expect(payload.new_billing_cycle).toBe('annual');
    expect(payload.amount_to_pay).toBe(285);
    expect(payload.credit_applied).toBe(15);
    expect(payload.credit_remaining).toBe(0);

    expect(audit.logChange).toHaveBeenCalledTimes(1);
    expect(res.proration.amount_to_pay).toBe(285);
  });

  it('downgrade con sobrante: acumula el crédito sobrante en credit_balance_eur y no cobra', async () => {
    // Anual 365€, 5 días consumidos → crédito enorme; nuevo mensual 10€.
    prisma.service.findUnique.mockResolvedValue(
      monthlyService({
        billing_cycle: 'annual',
        amount: 365,
        next_due_date: new Date(Date.now() + 360 * 24 * 60 * 60 * 1000),
      }),
    );
    prisma.productPricing.findUnique.mockResolvedValue(
      annualPricing({ billing_cycle: 'monthly', price: 10 }),
    );

    await service.confirmPlanChange('svc-1', 'pr-monthly', 'user-1', false);

    const updateCalls = txUpdate.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const data = updateCalls[0][0].data;
    const increment = (data.credit_balance_eur as { increment: number })
      .increment;
    expect(increment).toBeGreaterThan(0); // sobrante a cuenta (sin refund)
    const downgradeCalls = outbox.enqueue.mock.calls as Array<
      [unknown, string, Record<string, number>]
    >;
    const [, , payload] = downgradeCalls[0];
    expect(payload.amount_to_pay).toBe(0);
    expect(payload.credit_remaining).toBe(increment);
  });

  it('rechaza cambio entre productos distintos (ADR-029: mismo producto)', async () => {
    prisma.service.findUnique.mockResolvedValue(monthlyService());
    prisma.productPricing.findUnique.mockResolvedValue(
      annualPricing({ product_id: 'prod-OTHER' }),
    );

    await expect(
      service.confirmPlanChange('svc-1', 'pr-annual', 'user-1', false),
    ).rejects.toThrow(BadRequestException);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('rechaza si el ciclo destino es el actual (ADR-029: solo entre ciclos)', async () => {
    prisma.service.findUnique.mockResolvedValue(monthlyService());
    prisma.productPricing.findUnique.mockResolvedValue(
      annualPricing({ billing_cycle: 'monthly' }),
    );

    await expect(
      service.confirmPlanChange('svc-1', 'pr', 'user-1', false),
    ).rejects.toThrow(/ciclo actual/);
  });

  it('rechaza cambio a otra moneda', async () => {
    prisma.service.findUnique.mockResolvedValue(monthlyService());
    prisma.productPricing.findUnique.mockResolvedValue(
      annualPricing({ currency: 'USD' }),
    );

    await expect(
      service.confirmPlanChange('svc-1', 'pr-annual', 'user-1', false),
    ).rejects.toThrow(/moneda/);
  });

  it('rechaza si el servicio no está activo', async () => {
    prisma.service.findUnique.mockResolvedValue(
      monthlyService({ status: 'suspended' }),
    );
    prisma.productPricing.findUnique.mockResolvedValue(annualPricing());

    await expect(
      service.confirmPlanChange('svc-1', 'pr-annual', 'user-1', false),
    ).rejects.toThrow(/activos/);
  });

  it('IDOR: un no-dueño (no admin) recibe NotFound, no toca el servicio ajeno', async () => {
    prisma.service.findUnique.mockResolvedValue(
      monthlyService({ user_id: 'someone-else' }),
    );

    await expect(
      service.confirmPlanChange('svc-1', 'pr-annual', 'attacker', false),
    ).rejects.toThrow(NotFoundException);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('admin puede cambiar el plan de un servicio que no es suyo', async () => {
    prisma.service.findUnique.mockResolvedValue(
      monthlyService({ user_id: 'a-client' }),
    );
    prisma.productPricing.findUnique.mockResolvedValue(annualPricing());

    await service.confirmPlanChange('svc-1', 'pr-annual', 'staff-1', true);

    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });
});

import { BillingCalculatorService } from './billing-calculator.service';

/**
 * ADR-029 (prorrateo en cambio de plan) — la matemática del crédito es la pieza
 * sensible (mueve dinero). `calculateProration` es puro (no toca Prisma), así que
 * se testea de forma aislada con el ejemplo literal del ADR + el caso del sobrante
 * (`creditRemaining`) que la Fase de cambio de plan añade.
 */
describe('BillingCalculatorService.calculateProration (ADR-029)', () => {
  const calc = new BillingCalculatorService(null as never);

  it('ejemplo literal del ADR-029: mensual 30€ → anual 300€ a mitad de ciclo', () => {
    // 15 días consumidos de 30 → precio_diario=1, crédito=15, total=300-15=285.
    const r = calc.calculateProration({
      currentAmount: 30,
      currentCycleDays: 30,
      daysUsed: 15,
      newAmount: 300,
    });
    expect(r.dailyRate).toBe(1);
    expect(r.unusedDays).toBe(15);
    expect(r.credit).toBe(15);
    expect(r.newCharge).toBe(300);
    expect(r.totalDue).toBe(285);
    expect(r.creditRemaining).toBe(0);
  });

  it('downgrade con SOBRANTE: crédito > plan nuevo → totalDue=0 + creditRemaining (sin refund)', () => {
    // Mensual 30€, 3 días usados de 30 → 27 días no consumidos, crédito 27€.
    // Nuevo plan 10€: el crédito lo cubre entero y sobran 17€ (a cuenta).
    const r = calc.calculateProration({
      currentAmount: 30,
      currentCycleDays: 30,
      daysUsed: 3,
      newAmount: 10,
    });
    expect(r.credit).toBe(27);
    expect(r.totalDue).toBe(0);
    expect(r.creditRemaining).toBe(17);
  });

  it('totalDue y creditRemaining son mutuamente excluyentes (uno siempre es 0)', () => {
    const upgrade = calc.calculateProration({
      currentAmount: 30,
      currentCycleDays: 30,
      daysUsed: 10,
      newAmount: 300,
    });
    expect(upgrade.totalDue).toBeGreaterThan(0);
    expect(upgrade.creditRemaining).toBe(0);

    const downgrade = calc.calculateProration({
      currentAmount: 120,
      currentCycleDays: 30,
      daysUsed: 1,
      newAmount: 10,
    });
    expect(downgrade.totalDue).toBe(0);
    expect(downgrade.creditRemaining).toBeGreaterThan(0);
  });

  it('ciclo agotado (daysUsed ≥ cycleDays) → sin crédito, cobra el plan nuevo entero', () => {
    const r = calc.calculateProration({
      currentAmount: 30,
      currentCycleDays: 30,
      daysUsed: 30,
      newAmount: 300,
    });
    expect(r.unusedDays).toBe(0);
    expect(r.credit).toBe(0);
    expect(r.totalDue).toBe(300);
    expect(r.creditRemaining).toBe(0);
  });

  it('daysUsed mayor que el ciclo no genera crédito negativo (clamp a 0)', () => {
    const r = calc.calculateProration({
      currentAmount: 30,
      currentCycleDays: 30,
      daysUsed: 45,
      newAmount: 300,
    });
    expect(r.unusedDays).toBe(0);
    expect(r.credit).toBe(0);
    expect(r.totalDue).toBe(300);
  });

  it('redondea importes a 2 decimales', () => {
    // dailyRate = 100/30 = 3.3333… → 3.33; 20 días → crédito round(20×3.3333…)=66.67.
    const r = calc.calculateProration({
      currentAmount: 100,
      currentCycleDays: 30,
      daysUsed: 10,
      newAmount: 50,
    });
    expect(r.dailyRate).toBe(3.33);
    expect(r.credit).toBe(66.67);
    expect(r.totalDue).toBe(0);
    expect(r.creditRemaining).toBe(16.67);
  });
});

describe('BillingCalculatorService.getCycleDays', () => {
  const calc = new BillingCalculatorService(null as never);

  it('mapea los ciclos canónicos a días', () => {
    expect(calc.getCycleDays('monthly')).toBe(30);
    expect(calc.getCycleDays('quarterly')).toBe(90);
    expect(calc.getCycleDays('semiannual')).toBe(180);
    expect(calc.getCycleDays('annual')).toBe(365);
    expect(calc.getCycleDays('one_time')).toBe(0);
  });

  it('cae a 30 (mensual) ante un ciclo desconocido', () => {
    expect(calc.getCycleDays('weekly')).toBe(30);
  });
});

/**
 * Sprint 12 — fix de `getSettingValue`: lee el valor CRUDO (el shape del seed +
 * CRUD admin), no el envoltorio `{value}` muerto que siempre caía al default.
 * Esto es lo que hace que los settings del ciclo de vida de billing
 * (`suspension_days`, `cancellation_days`, `max_payment_retries`, …) sean de
 * verdad configurables desde `/admin/settings`.
 */
describe('BillingCalculatorService.getSettingValue (lectura cruda)', () => {
  function make(value: unknown): BillingCalculatorService {
    const prisma = {
      setting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(value === undefined ? null : { value }),
      },
    };
    return new BillingCalculatorService(prisma as never);
  }

  it('lee un número guardado como string crudo ("10" → 10)', async () => {
    expect(
      await make('10').getSettingValue('billing', 'suspension_days', 7),
    ).toBe(10);
  });

  it('lee un número nativo (14 → 14)', async () => {
    expect(
      await make(14).getSettingValue('billing', 'payment_due_days', 7),
    ).toBe(14);
  });

  it('cae al default si la fila no existe', async () => {
    expect(
      await make(undefined).getSettingValue('billing', 'suspension_days', 7),
    ).toBe(7);
  });

  it('cae al default si el valor no es coercionable a número', async () => {
    expect(
      await make({ nested: true }).getSettingValue(
        'billing',
        'suspension_days',
        7,
      ),
    ).toBe(7);
  });

  it('lee un string crudo (prefijo de factura)', async () => {
    expect(
      await make('AEL').getSettingValue('billing', 'invoice_prefix', 'XXX'),
    ).toBe('AEL');
  });
});

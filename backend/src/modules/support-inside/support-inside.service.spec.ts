import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { BillingCheckoutService } from '../billing/billing-checkout.service';
import { SubscriptionPlanChangeService } from '../billing/subscription-plan-change.service';
import { SupportInsideService } from './support-inside.service';

/**
 * Tests unit SupportInsideService — Sprint 8 Fase D.
 *
 * Cobertura crítica de la doctrina ADR-034 + ADR-061 + ADR-072:
 *   - subscribe rechaza si ya hay subscription activa (409).
 *   - subscribe rechaza si pricing no es type=support_inside (400 defense).
 *   - subscribe reactivacancellation existente (no crea duplicada).
 *   - cancel libera slots en cascada y cancela el Service estándar.
 *   - addSlot valida ownership, plan, slot único activo por servicio.
 *   - addSlot agotada slots_included sin is_extra → 400 con mensaje.
 *   - releaseSlot rechaza si slot ajeno o ya liberado.
 *   - upgrade prorratea (ADR-029 A1 cross-tier) + guard de slots en downgrade.
 */
type CallArgs = Record<string, unknown>;
const firstCallFirstArg = (spy: jest.Mock): CallArgs =>
  (spy.mock.calls[0] as unknown as [CallArgs])[0];

describe('SupportInsideService — Sprint 8 Fase D', () => {
  let service: SupportInsideService;
  let prisma: {
    supportInsideSubscription: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    supportInsideSlot: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    productPricing: { findUnique: jest.Mock };
    product: { findMany: jest.Mock };
    service: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let events: { emit: jest.Mock };
  let checkout: { checkout: jest.Mock };
  let planChange: {
    confirmPlanChange: jest.Mock;
    previewPlanChange: jest.Mock;
  };

  const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
  const SERVICE_ID = '22222222-2222-2222-2222-222222222222';
  const PRICING_ID = '33333333-3333-3333-3333-333333333333';
  const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';
  const SUBSCRIPTION_ID = '55555555-5555-5555-5555-555555555555';
  const SLOT_ID = '66666666-6666-6666-6666-666666666666';
  const NEW_SERVICE_ID = '77777777-7777-7777-7777-777777777777';

  beforeEach(async () => {
    prisma = {
      supportInsideSubscription: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      supportInsideSlot: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      productPricing: { findUnique: jest.fn() },
      product: { findMany: jest.fn() },
      service: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    // $transaction aquí ejecuta el callback con el mismo prisma como tx
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );
    events = { emit: jest.fn() };
    checkout = { checkout: jest.fn() };
    planChange = {
      confirmPlanChange: jest.fn().mockResolvedValue({
        service: { id: SERVICE_ID },
        proration: { amount_to_pay: 60 },
      }),
      previewPlanChange: jest.fn().mockResolvedValue({ amount_to_pay: 60 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportInsideService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: BillingCheckoutService, useValue: checkout },
        { provide: SubscriptionPlanChangeService, useValue: planChange },
      ],
    }).compile();

    service = module.get(SupportInsideService);
  });

  // ─── subscribe ───────────────────────────────────────────────

  it('subscribe → 409 si el cliente ya tiene subscription activa', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      status: 'active',
    });

    await expect(
      service.subscribe(CLIENT_ID, { product_pricing_id: PRICING_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(checkout.checkout).not.toHaveBeenCalled();
  });

  it('subscribe → 400 si pricing no es type=support_inside (defense in depth)', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);
    prisma.productPricing.findUnique.mockResolvedValue({
      id: PRICING_ID,
      product_id: PRODUCT_ID,
      product: { id: PRODUCT_ID, type: 'hosting_web', name: 'Hosting Pro' },
    });

    await expect(
      service.subscribe(CLIENT_ID, { product_pricing_id: PRICING_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('subscribe → flujo completo: checkout + create subscription + emit event', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);
    prisma.productPricing.findUnique.mockResolvedValue({
      id: PRICING_ID,
      product_id: PRODUCT_ID,
      product: {
        id: PRODUCT_ID,
        type: 'support_inside',
        slug: 'support-inside-pro',
        name: 'Support Inside Pro',
      },
    });
    checkout.checkout.mockResolvedValue({
      service: { id: SERVICE_ID },
      invoice: { id: 'inv-1' },
    });
    prisma.supportInsideSubscription.create.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      client_id: CLIENT_ID,
      product_id: PRODUCT_ID,
      service_id: SERVICE_ID,
      status: 'active',
    });

    const result = await service.subscribe(CLIENT_ID, {
      product_pricing_id: PRICING_ID,
    });

    expect(checkout.checkout).toHaveBeenCalledWith(CLIENT_ID, {
      product_pricing_id: PRICING_ID,
      billing_profile_id: undefined,
      label: 'Support Inside — Support Inside Pro',
    });
    expect(prisma.supportInsideSubscription.create).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.subscribed',
      expect.objectContaining({
        subscription_id: SUBSCRIPTION_ID,
        client_id: CLIENT_ID,
        product_id: PRODUCT_ID,
        service_id: SERVICE_ID,
      }),
    );
    expect(result.subscription.id).toBe(SUBSCRIPTION_ID);
  });

  it('subscribe → reactiva subscription cancelada (update, no create)', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      status: 'cancelled',
    });
    prisma.productPricing.findUnique.mockResolvedValue({
      id: PRICING_ID,
      product_id: PRODUCT_ID,
      product: {
        id: PRODUCT_ID,
        type: 'support_inside',
        slug: 'support-inside-basico',
        name: 'Support Inside Básico',
      },
    });
    checkout.checkout.mockResolvedValue({
      service: { id: SERVICE_ID },
      invoice: { id: 'inv-2' },
    });
    prisma.supportInsideSubscription.update.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      client_id: CLIENT_ID,
      product_id: PRODUCT_ID,
      service_id: SERVICE_ID,
      status: 'active',
    });

    await service.subscribe(CLIENT_ID, { product_pricing_id: PRICING_ID });

    expect(prisma.supportInsideSubscription.create).not.toHaveBeenCalled();
    const upd = firstCallFirstArg(prisma.supportInsideSubscription.update) as {
      where: CallArgs;
      data: CallArgs;
    };
    expect(upd.where).toEqual({ client_id: CLIENT_ID });
    expect(upd.data.product_id).toBe(PRODUCT_ID);
    expect(upd.data.service_id).toBe(SERVICE_ID);
    expect(upd.data.status).toBe('active');
    expect(upd.data.cancelled_at).toBeNull();
  });

  // ─── cancel (cascada de slots — 8.D.8) ────────────────────────

  it('cancel → libera todos los slots activos + cancela Service + emite eventos', async () => {
    const activeSlots = [
      { id: 'slot-1', service_id: SERVICE_ID },
      { id: 'slot-2', service_id: NEW_SERVICE_ID },
    ];
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      service_id: SERVICE_ID,
      status: 'active',
      slots: activeSlots,
    });

    const result = await service.cancel(CLIENT_ID, { reason: 'no lo uso' });

    expect(result).toEqual({ cancelled: true, released_slots: 2 });
    const slotUpd = firstCallFirstArg(prisma.supportInsideSlot.updateMany) as {
      where: CallArgs;
      data: CallArgs;
    };
    expect(slotUpd.where).toEqual({ id: { in: ['slot-1', 'slot-2'] } });
    expect(slotUpd.data.released_at).toBeInstanceOf(Date);
    const subUpd = firstCallFirstArg(
      prisma.supportInsideSubscription.update,
    ) as { where: CallArgs; data: CallArgs };
    expect(subUpd.where).toEqual({ id: SUBSCRIPTION_ID });
    expect(subUpd.data.status).toBe('cancelled');
    expect(subUpd.data.cancellation_reason).toBe('no lo uso');
    const svcUpd = firstCallFirstArg(prisma.service.update) as {
      where: CallArgs;
      data: CallArgs;
    };
    expect(svcUpd.where).toEqual({ id: SERVICE_ID });
    expect(svcUpd.data.status).toBe('cancelled');
    // 2 slot_released + 1 cancelled = 3 emits
    expect(events.emit).toHaveBeenCalledTimes(3);
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.slot_released',
      expect.objectContaining({ slot_id: 'slot-1' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.slot_released',
      expect.objectContaining({ slot_id: 'slot-2' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.cancelled',
      expect.objectContaining({ released_slots: 2 }),
    );
  });

  it('cancel → 404 si no hay subscription activa', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);

    await expect(service.cancel(CLIENT_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ─── addSlot ─────────────────────────────────────────────────

  function mockActiveSubscription(
    overrides: {
      slots_included?: number;
      slot_types_allowed?: Array<'maintenance' | 'maintenance_management'>;
      applicable_product_types?: string[];
    } = {},
  ) {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      client_id: CLIENT_ID,
      status: 'active',
      product: {
        name: 'Support Inside Test',
        support_inside_config: {
          slots_included: overrides.slots_included ?? 1,
          slot_types_allowed: overrides.slot_types_allowed ?? ['maintenance'],
          // Sub-fase 8.D.12 (2026-05-01): por defecto admite hosting_web —
          // los tests existentes mockean service.product.type='hosting_web'
          // así que pasan el filtro. Tests que prueben rechazo deben
          // override con [] o un tipo distinto.
          applicable_product_types: overrides.applicable_product_types ?? [
            'hosting_web',
          ],
        },
      },
    });
  }

  it('addSlot → 403 si el servicio no pertenece al cliente', async () => {
    mockActiveSubscription();
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: 'OTHER_USER',
      status: 'active',
      product: { type: 'hosting_web' },
    });

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('addSlot → 400 si service.product.type NO está en applicable_product_types del plan (D.12 fix)', async () => {
    // Plan que solo permite mantenimiento de hosting_web. Cliente intenta
    // asignar el slot a un dominio (type=domain) → rechazo con 400 +
    // mensaje accionable que enumera tipos permitidos.
    mockActiveSubscription({ applicable_product_types: ['hosting_web'] });
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      product: { type: 'domain' },
    });

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supportInsideSlot.create).not.toHaveBeenCalled();
  });

  it('addSlot → empty applicable_product_types = sin restricción (legacy/Enterprise)', async () => {
    mockActiveSubscription({ applicable_product_types: [] });
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      product: { type: 'we_do_it' },
    });
    prisma.supportInsideSlot.findFirst.mockResolvedValue(null);
    prisma.supportInsideSlot.count.mockResolvedValue(0);
    prisma.supportInsideSlot.create.mockResolvedValue({
      id: SLOT_ID,
      subscription_id: SUBSCRIPTION_ID,
      service_id: SERVICE_ID,
      slot_type: 'maintenance',
      is_extra: false,
    });

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance',
      }),
    ).resolves.toBeDefined();
  });

  it('addSlot → 400 si el service.product.type=support_inside (defense in depth, fix 2026-05-01)', async () => {
    mockActiveSubscription();
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      // El plan SI vive en `services` solo como vehículo de billing —
      // NO es un recurso técnico mantenible. Asignarse un slot a sí
      // mismo es semánticamente absurdo.
      product: { type: 'support_inside' },
    });

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supportInsideSlot.create).not.toHaveBeenCalled();
  });

  it('addSlot → 409 si el servicio ya tiene slot activo', async () => {
    mockActiveSubscription();
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      product: { type: 'hosting_web' },
    });
    prisma.supportInsideSlot.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('addSlot → 400 si slot_type no permitido por el plan', async () => {
    mockActiveSubscription({ slot_types_allowed: ['maintenance'] });
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      product: { type: 'hosting_web' },
    });
    prisma.supportInsideSlot.findFirst.mockResolvedValue(null);

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance_management',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('addSlot → 400 si slots_included agotados sin is_extra', async () => {
    mockActiveSubscription({ slots_included: 1 });
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      product: { type: 'hosting_web' },
    });
    prisma.supportInsideSlot.findFirst.mockResolvedValue(null);
    prisma.supportInsideSlot.count.mockResolvedValue(1); // ya tiene 1 incluido

    await expect(
      service.addSlot(CLIENT_ID, {
        service_id: SERVICE_ID,
        slot_type: 'maintenance',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('addSlot → flujo OK crea slot + emite event', async () => {
    mockActiveSubscription({ slots_included: 1 });
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      user_id: CLIENT_ID,
      status: 'active',
      product: { type: 'hosting_web' },
    });
    prisma.supportInsideSlot.findFirst.mockResolvedValue(null);
    prisma.supportInsideSlot.count.mockResolvedValue(0);
    prisma.supportInsideSlot.create.mockResolvedValue({
      id: SLOT_ID,
      subscription_id: SUBSCRIPTION_ID,
      service_id: SERVICE_ID,
      slot_type: 'maintenance',
      is_extra: false,
    });

    const slot = await service.addSlot(CLIENT_ID, {
      service_id: SERVICE_ID,
      slot_type: 'maintenance',
    });

    expect(slot.id).toBe(SLOT_ID);
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.slot_assigned',
      expect.objectContaining({
        slot_id: SLOT_ID,
        client_id: CLIENT_ID,
        service_id: SERVICE_ID,
      }),
    );
  });

  // ─── releaseSlot ─────────────────────────────────────────────

  it('releaseSlot → 403 si el slot no pertenece al cliente', async () => {
    prisma.supportInsideSlot.findUnique.mockResolvedValue({
      id: SLOT_ID,
      subscription_id: SUBSCRIPTION_ID,
      service_id: SERVICE_ID,
      released_at: null,
      subscription: { client_id: 'OTHER_USER' },
    });

    await expect(
      service.releaseSlot(CLIENT_ID, SLOT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('releaseSlot → 400 si el slot ya está liberado', async () => {
    prisma.supportInsideSlot.findUnique.mockResolvedValue({
      id: SLOT_ID,
      subscription_id: SUBSCRIPTION_ID,
      service_id: SERVICE_ID,
      released_at: new Date(),
      subscription: { client_id: CLIENT_ID },
    });

    await expect(
      service.releaseSlot(CLIENT_ID, SLOT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releaseSlot → marca released_at + emite event', async () => {
    prisma.supportInsideSlot.findUnique.mockResolvedValue({
      id: SLOT_ID,
      subscription_id: SUBSCRIPTION_ID,
      service_id: SERVICE_ID,
      released_at: null,
      subscription: { client_id: CLIENT_ID },
    });

    const result = await service.releaseSlot(CLIENT_ID, SLOT_ID);

    expect(result).toEqual({ released: true });
    const updArgs = firstCallFirstArg(prisma.supportInsideSlot.update) as {
      where: CallArgs;
      data: CallArgs;
    };
    expect(updArgs.where).toEqual({ id: SLOT_ID });
    expect(updArgs.data.released_at).toBeInstanceOf(Date);
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.slot_released',
      expect.objectContaining({ slot_id: SLOT_ID, reason: 'manual' }),
    );
  });

  // ─── upgrade / cambio de plan (GL-23 / ADR-029 A1) ───────────

  const TARGET_PRODUCT_ID = '88888888-8888-8888-8888-888888888888';
  const activeSub = (over: Record<string, unknown> = {}) => ({
    id: SUBSCRIPTION_ID,
    client_id: CLIENT_ID,
    product_id: PRODUCT_ID,
    service_id: SERVICE_ID,
    status: 'active',
    slots: [] as Array<{ id: string; is_extra: boolean }>,
    ...over,
  });
  const targetPricing = (over: Record<string, unknown> = {}) => ({
    id: PRICING_ID,
    product_id: TARGET_PRODUCT_ID,
    billing_cycle: 'monthly',
    price: 79,
    currency: 'EUR',
    product: {
      type: 'support_inside',
      support_inside_config: { slots_included: 1 },
    },
    ...over,
  });

  it('upgrade → prorratea (allowCrossProduct + txHook) y emite plan_changed', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(activeSub());
    prisma.productPricing.findUnique.mockResolvedValue(targetPricing());

    const res = await service.upgrade(CLIENT_ID, {
      new_product_pricing_id: PRICING_ID,
    });

    expect(planChange.confirmPlanChange).toHaveBeenCalledTimes(1);
    const [svcId, prId, uid, isAdmin, opts] = (
      planChange.confirmPlanChange.mock.calls as Array<
        [
          string,
          string,
          string,
          boolean,
          {
            allowCrossProduct?: boolean;
            txHook: (tx: unknown) => Promise<void>;
          },
        ]
      >
    )[0];
    expect(svcId).toBe(SERVICE_ID);
    expect(prId).toBe(PRICING_ID);
    expect(uid).toBe(CLIENT_ID);
    expect(isAdmin).toBe(false);
    expect(opts.allowCrossProduct).toBe(true);
    // El txHook migra la subscription al nuevo producto (atómico).
    const tx = {
      supportInsideSubscription: { update: jest.fn().mockResolvedValue({}) },
    };
    await opts.txHook(tx);
    expect(tx.supportInsideSubscription.update).toHaveBeenCalledWith({
      where: { service_id: SERVICE_ID },
      data: { product_id: TARGET_PRODUCT_ID },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'support_inside.plan_changed',
      expect.objectContaining({ to_product_id: TARGET_PRODUCT_ID }),
    );
    expect((res as { ok: boolean }).ok).toBe(true);
  });

  it('upgrade → 409 si no hay suscripción activa', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);
    await expect(
      service.upgrade(CLIENT_ID, { new_product_pricing_id: PRICING_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(planChange.confirmPlanChange).not.toHaveBeenCalled();
  });

  it('upgrade → 400 si el plan destino no es Support Inside', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(activeSub());
    prisma.productPricing.findUnique.mockResolvedValue(
      targetPricing({
        product: { type: 'hosting_web', support_inside_config: null },
      }),
    );
    await expect(
      service.upgrade(CLIENT_ID, { new_product_pricing_id: PRICING_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(planChange.confirmPlanChange).not.toHaveBeenCalled();
  });

  it('upgrade → bloquea downgrade si dejaría slots incluidos huérfanos', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(
      activeSub({ slots: [{ id: SLOT_ID, is_extra: false }] }),
    );
    prisma.productPricing.findUnique.mockResolvedValue(
      targetPricing({
        product: {
          type: 'support_inside',
          support_inside_config: { slots_included: 0 },
        },
      }),
    );
    await expect(
      service.upgrade(CLIENT_ID, { new_product_pricing_id: PRICING_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(planChange.confirmPlanChange).not.toHaveBeenCalled();
  });

  it('previewUpgrade → delega en previewPlanChange con allowCrossProduct', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(activeSub());
    prisma.productPricing.findUnique.mockResolvedValue(targetPricing());
    await service.previewUpgrade(CLIENT_ID, {
      new_product_pricing_id: PRICING_ID,
    });
    expect(planChange.previewPlanChange).toHaveBeenCalledWith(
      SERVICE_ID,
      PRICING_ID,
      CLIENT_ID,
      false,
      { allowCrossProduct: true },
    );
  });

  // ─── listPublicPlans ─────────────────────────────────────────

  it('listPublicPlans → mapea producto + config + pricing al shape comparador cliente (ADR-075 §B.1)', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        slug: 'support-inside-medium',
        name: 'Support Inside Medium',
        short_description: '1 slot incluido',
        description: 'Plan medio',
        badge_text: 'Recomendado',
        order_index: 2,
        support_inside_config: {
          slots_included: 1,
          slot_types_allowed: ['maintenance'],
          extra_slot_price: { toString: () => '12.00' },
          channels_active: ['webchat', 'email', 'phone', 'whatsapp'],
          priority_tier: 'high',
          response_sla_hours: 12,
        },
        pricing: [
          {
            id: 'PR-MONTH',
            billing_cycle: 'monthly',
            currency: 'EUR',
            price: { toString: () => '39.00' },
            discount_percentage: null,
          },
          {
            id: 'PR-YEAR',
            billing_cycle: 'annual',
            currency: 'EUR',
            price: { toString: () => '397.80' },
            discount_percentage: { toString: () => '15.00' },
          },
        ],
      },
    ]);

    const out = await service.listPublicPlans();

    expect(out).toHaveLength(1);
    const plan = out[0];
    expect(plan.slug).toBe('support-inside-medium');
    expect(plan.badge_text).toBe('Recomendado');
    expect(plan.pricing.monthly).toEqual({
      product_pricing_id: 'PR-MONTH',
      price: '39.00',
      currency: 'EUR',
    });
    expect(plan.pricing.yearly).toEqual({
      product_pricing_id: 'PR-YEAR',
      price: '397.80',
      currency: 'EUR',
      discount_percentage: '15.00',
    });
    expect(plan.config?.slots_included).toBe(1);
    expect(plan.config?.channels_active).toEqual([
      'webchat',
      'email',
      'phone',
      'whatsapp',
    ]);

    // Filtro canónico: sólo `type=support_inside` activos.
    const where = firstCallFirstArg(prisma.product.findMany).where as Record<
      string,
      unknown
    >;
    expect(where.type).toBe('support_inside');
    expect(where.status).toBe('active');
  });

  it('listPublicPlans → devuelve config null si el producto no tiene support_inside_config (defensa anti-drift)', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        slug: 'support-inside-basico',
        name: 'Básico',
        short_description: 'Sin slots',
        description: null,
        badge_text: null,
        order_index: 1,
        support_inside_config: null,
        pricing: [],
      },
    ]);
    const [plan] = await service.listPublicPlans();
    expect(plan.config).toBeNull();
    expect(plan.pricing.monthly).toBeNull();
    expect(plan.pricing.yearly).toBeNull();
  });
});

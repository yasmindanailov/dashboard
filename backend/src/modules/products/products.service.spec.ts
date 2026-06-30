import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ProductsService } from './products.service';

/**
 * Tests unit `ProductsService.getPurchaseContext` — Sprint 15D Fase 15D.F.4.
 * (Tienda consciente del estado: addon global 1/cuenta + max_quantity_per_client.)
 */
describe('ProductsService.getPurchaseContext', () => {
  const USER = 'user-1';
  let prisma: {
    product: { findUnique: jest.Mock };
    supportInsideSubscription: { findUnique: jest.Mock };
    service: { count: jest.Mock };
  };
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      supportInsideSubscription: { findUnique: jest.fn() },
      service: { count: jest.fn() },
    };
    service = new ProductsService(prisma as never, {} as never);
  });

  it('producto inexistente → NotFoundException', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(
      service.getPurchaseContext(USER, 'p-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('addon global ya contratado (Support Inside) → canBuy:false owns_global_addon', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-si',
      type: 'support_inside',
      is_global_addon: true,
      max_quantity_per_client: null,
    });
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: 'active',
    });

    const ctx = await service.getPurchaseContext(USER, 'p-si');
    expect(ctx).toMatchObject({
      canBuy: false,
      reason: 'owns_global_addon',
      isGlobalAddon: true,
      ownedSubscriptionId: 'sub-1',
    });
  });

  it('addon global sin suscripción activa → canBuy:true', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-si',
      type: 'support_inside',
      is_global_addon: true,
      max_quantity_per_client: null,
    });
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);

    const ctx = await service.getPurchaseContext(USER, 'p-si');
    expect(ctx).toMatchObject({
      canBuy: true,
      reason: 'ok',
      isGlobalAddon: true,
    });
  });

  it('suscripción cancelada NO bloquea (canBuy:true)', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-si',
      type: 'support_inside',
      is_global_addon: true,
      max_quantity_per_client: null,
    });
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: 'cancelled',
    });

    const ctx = await service.getPurchaseContext(USER, 'p-si');
    expect(ctx.canBuy).toBe(true);
  });

  it('max_quantity_per_client alcanzado → canBuy:false at_quantity_limit', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-h',
      type: 'hosting_web',
      is_global_addon: false,
      max_quantity_per_client: 2,
    });
    prisma.service.count.mockResolvedValue(2);

    const ctx = await service.getPurchaseContext(USER, 'p-h');
    expect(ctx).toMatchObject({
      canBuy: false,
      reason: 'at_quantity_limit',
      maxQuantity: 2,
      currentQuantity: 2,
    });
  });

  it('max_quantity_per_client por debajo del tope → canBuy:true', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-h',
      type: 'hosting_web',
      is_global_addon: false,
      max_quantity_per_client: 2,
    });
    prisma.service.count.mockResolvedValue(1);

    const ctx = await service.getPurchaseContext(USER, 'p-h');
    expect(ctx).toMatchObject({
      canBuy: true,
      currentQuantity: 1,
      maxQuantity: 2,
    });
  });

  it('producto sin límite (max NULL, no global) → canBuy:true', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-h',
      type: 'hosting_web',
      is_global_addon: false,
      max_quantity_per_client: null,
    });

    const ctx = await service.getPurchaseContext(USER, 'p-h');
    expect(ctx).toMatchObject({ canBuy: true, maxQuantity: null });
    expect(prisma.service.count).not.toHaveBeenCalled();
  });
});

/**
 * Tests unit `ProductsService.duplicate` — F4·U26 (kebab "Duplicar" del detalle).
 * Clona producto + relaciones (pricing/extras/checklist) en uno inactivo con
 * slug `-copia`; rechaza Support Inside (ADR-075) y producto inexistente.
 */
describe('ProductsService.duplicate', () => {
  let prisma: {
    product: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new ProductsService(prisma as never, {} as never);
  });

  it('producto inexistente → NotFoundException', async () => {
    prisma.product.findUnique.mockResolvedValueOnce(null);
    await expect(service.duplicate('p-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('producto support_inside → BadRequestException (ADR-075)', async () => {
    prisma.product.findUnique.mockResolvedValueOnce({
      id: 'p-si',
      type: 'support_inside',
      slug: 'support-inside-pro',
      pricing: [],
      extras: [],
      checklist_items: [],
    });
    await expect(service.duplicate('p-si')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('clona producto + relaciones: slug "-copia", inactivo, name "(copia)"', async () => {
    const source = {
      id: 'p1',
      type: 'hosting_web',
      slug: 'web-pro',
      name: 'Web Pro',
      category_id: 'cat-1',
      description: 'desc',
      short_description: 'short',
      provisioner: 'enhance_cp',
      image_url: null,
      badge_text: 'Popular',
      order_index: 0,
      is_addon: false,
      is_global_addon: false,
      requires_existing_product: false,
      required_product_type: null,
      max_quantity_per_client: null,
      grace_period_days: 0,
      suspension_days: 7,
      cancellation_days: 30,
      data_retention_days: 30,
      client_can_pause: false,
      pause_max_days: null,
      provisioner_config: null,
      audit_event_types: null,
      features: null,
      metadata: null,
      partner_commission_pct: null,
      pricing: [
        {
          billing_cycle: 'monthly',
          price: '14.99',
          setup_fee: '0',
          currency: 'EUR',
          discount_percentage: null,
          active: true,
        },
      ],
      extras: [
        {
          extra_product_id: null,
          type: 'free_domain',
          is_mandatory: false,
          label: 'Dominio gratis',
          discount_percentage: null,
          free_months: null,
          max_value_eur: null,
          applicable_cycles: 'annual',
          tld_restrictions: null,
          valid_until: null,
          max_uses: null,
          active: true,
        },
      ],
      checklist_items: [{ label: 'Setup', order_index: 0, is_required: true }],
    };
    prisma.product.findUnique.mockResolvedValueOnce(source); // source
    prisma.product.findUnique.mockResolvedValueOnce(null); // slug 'web-pro-copia' libre

    const tx = {
      product: {
        create: jest.fn().mockResolvedValue({ id: 'p2' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'p2',
          slug: 'web-pro-copia',
          status: 'inactive',
        }),
      },
      productPricing: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      productExtra: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      productChecklistItem: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) =>
      cb(tx),
    );

    await service.duplicate('p1');

    // El producto base se crea con slug "-copia", inactivo y nombre "(copia)".
    const createCalls = tx.product.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0][0].data).toMatchObject({
      slug: 'web-pro-copia',
      status: 'inactive',
      name: 'Web Pro (copia)',
      type: 'hosting_web',
    });
    expect(tx.productPricing.createMany).toHaveBeenCalledTimes(1);
    expect(tx.productExtra.createMany).toHaveBeenCalledTimes(1);
    expect(tx.productChecklistItem.createMany).toHaveBeenCalledTimes(1);
    // Re-lee el producto creado (con relaciones) para devolverlo.
    const refetchCalls = tx.product.findUnique.mock.calls as Array<
      [{ where: { id: string } }]
    >;
    expect(refetchCalls[0][0].where).toEqual({ id: 'p2' });
  });
});

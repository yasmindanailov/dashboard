import { NotFoundException } from '@nestjs/common';

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

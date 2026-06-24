/* eslint-disable
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access
*/
// Doctrina canónica TS-ESLint para specs Jest (igual que provisioning.service.spec):
//  - `no-unsafe-assignment` / `no-unsafe-member-access`: falsos positivos al anidar
//    `expect.objectContaining(...)` (devuelve `any`) o acceder a `mock.calls[0][0]`
//    (Jest tipa los args como `any`). Aplica SOLO a este spec.

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingCalculatorService } from './billing-calculator.service';
import { BillingInvoiceService } from './billing-invoice.service';
import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Sprint 15D Fase B — BillingCheckoutService refactor a checkout multi-ítem
 * (ADR-084 §2) + DOM-INV-2/3. Cubre:
 *   - Preservación EXACTA del path `product` (compra actual de 1 producto).
 *   - Ítem `domain`: precio desde `domain_tld_pricing` + DOM-INV-3 margin guard
 *     + DOM-INV-2 checkout-side (advisory lock + guard anti-duplicado).
 *   - Multi-ítem (flujo F1 dominio + hosting → 2 services + 1 factura).
 */
describe('BillingCheckoutService', () => {
  let service: BillingCheckoutService;
  let prisma: {
    user: { findUnique: jest.Mock };
    billingProfile: { findFirst: jest.Mock };
    productPricing: { findUnique: jest.Mock };
    product: { findUnique: jest.Mock; findFirst: jest.Mock };
    domainTldPricing: { findUnique: jest.Mock };
    clientProfile: { findFirst: jest.Mock };
    service: { count: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let calculator: { getCycleDays: jest.Mock };
  let invoiceService: { createInvoice: jest.Mock };
  let registry: { getByCapability: jest.Mock };
  let svcCounter: number;

  const USER_ID = 'user-1';

  type Overrides = Record<string, unknown>;

  function productPricingFixture(overrides: Overrides = {}) {
    return {
      id: 'pp-1',
      product_id: 'prod-hosting',
      active: true,
      price: 100,
      discount_percentage: null,
      setup_fee: 0,
      billing_cycle: 'monthly',
      currency: 'EUR',
      product: {
        name: 'Hosting Pro',
        type: 'hosting_web',
        status: 'active',
        max_quantity_per_client: null,
      },
      ...overrides,
    };
  }

  function domainProductFixture(overrides: Overrides = {}) {
    return {
      id: 'prod-domain',
      name: 'Dominio',
      type: 'domain',
      status: 'active',
      provisioner: 'resellerclub',
      ...overrides,
    };
  }

  function domainPricingFixture(overrides: Overrides = {}) {
    return {
      active: true,
      cost_amount: 8,
      cost_currency: 'EUR',
      price_amount: 12,
      price_currency: 'EUR',
      ...overrides,
    };
  }

  /** Eventos emitidos como tuplas [nombre, payload] tipadas. */
  function emittedEvents(): Array<[string, Record<string, unknown>]> {
    return eventEmitter.emit.mock.calls as Array<
      [string, Record<string, unknown>]
    >;
  }

  /** Primer argumento de la primera llamada a createInvoice. */
  function firstInvoiceArg(): {
    currency: string;
    items: Array<Record<string, unknown>>;
  } {
    return invoiceService.createInvoice.mock.calls[0][0] as {
      currency: string;
      items: Array<Record<string, unknown>>;
    };
  }

  beforeEach(() => {
    svcCounter = 0;
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID }) },
      billingProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      productPricing: { findUnique: jest.fn() },
      product: {
        findUnique: jest.fn(),
        // checkoutCart resuelve el producto-dominio por capability (15D.F.4).
        findFirst: jest.fn().mockResolvedValue({ id: 'prod-domain' }),
      },
      domainTldPricing: { findUnique: jest.fn() },
      // DOM-INV-5 (15D.F.2): el gate de elegibilidad carga el perfil solo para
      // TLDs regulados (.es/.eu). Default elegible (NIF + país UE); los tests del
      // gate lo overridean.
      clientProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ tax_id: '12345678Z', country: 'ES' }),
      },
      service: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(
            (args: { data: Record<string, unknown> }): Promise<unknown> =>
              Promise.resolve({ id: `svc-${++svcCounter}`, ...args.data }),
          ),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest
        .fn()
        .mockImplementation((input: unknown): Promise<unknown> => {
          if (typeof input === 'function') {
            return (input as (tx: typeof prisma) => Promise<unknown>)(prisma);
          }
          if (Array.isArray(input)) return Promise.all(input as unknown[]);
          return Promise.reject(new Error('Unexpected $transaction input'));
        }),
    };
    eventEmitter = { emit: jest.fn() };
    calculator = { getCycleDays: jest.fn().mockReturnValue(30) };
    invoiceService = {
      createInvoice: jest.fn().mockImplementation(
        (dto: { currency: string; items: unknown[] }): Promise<unknown> =>
          Promise.resolve({
            id: 'inv-1',
            invoice_number: 'F-2026-001',
            total: 100,
            currency: dto.currency,
            items: dto.items,
          }),
      ),
    };

    registry = {
      getByCapability: jest.fn().mockReturnValue({ slug: 'resellerclub' }),
    };

    service = new BillingCheckoutService(
      prisma as unknown as PrismaService,
      eventEmitter as unknown as EventEmitter2,
      calculator as unknown as BillingCalculatorService,
      invoiceService as unknown as BillingInvoiceService,
      registry as unknown as PluginRegistryService,
    );
  });

  // ─── Path `product` — preservación del comportamiento actual ───────────

  describe('checkout (1 producto — wrapper legacy)', () => {
    it('crea 1 service + factura de 1 línea y devuelve la forma legacy', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture(),
      );

      const result = await service.checkout(USER_ID, {
        product_pricing_id: 'pp-1',
        label: 'Mi web',
      });

      expect(prisma.service.create).toHaveBeenCalledTimes(1);
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: USER_ID,
          product_id: 'prod-hosting',
          status: 'pending',
          label: 'Mi web',
          amount: 100,
          currency: 'EUR',
        }),
      });
      expect(invoiceService.createInvoice).toHaveBeenCalledTimes(1);
      const invoiceArg = firstInvoiceArg();
      expect(invoiceArg.items).toHaveLength(1);
      expect(invoiceArg.items[0]).toMatchObject({
        service_id: 'svc-1',
        product_id: 'prod-hosting',
        unit_price: 100,
        quantity: 1,
      });
      expect(result.service.id).toBe('svc-1');
      expect(result.invoice.invoice_number).toBe('F-2026-001');
      expect(result.invoice_type).toBe('simplificada');
      expect(result.discount_applied).toBeNull();
    });

    it('emite checkout.completed + service.provisioned exactamente una vez', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture(),
      );

      await service.checkout(USER_ID, { product_pricing_id: 'pp-1' });

      const events = emittedEvents();
      expect(events.filter((c) => c[0] === 'checkout.completed')).toHaveLength(
        1,
      );
      expect(events.filter((c) => c[0] === 'service.provisioned')).toHaveLength(
        1,
      );
      const provisioned = events.find(
        (c) => c[0] === 'service.provisioned',
      )?.[1];
      expect(provisioned).toMatchObject({
        service_id: 'svc-1',
        product_type: 'hosting_web',
        product_pricing_id: 'pp-1',
      });
    });

    it('aplica descuento y lo refleja en amount + discount_applied', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture({ price: 100, discount_percentage: 25 }),
      );

      const result = await service.checkout(USER_ID, {
        product_pricing_id: 'pp-1',
      });

      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: 75 }),
      });
      expect(result.discount_applied).toBe('25%');
    });

    it('invoice_type=completa cuando el perfil tiene nif_cif', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture(),
      );
      prisma.billingProfile.findFirst.mockResolvedValue({
        id: 'bp-1',
        user_id: USER_ID,
        nif_cif: 'B12345678',
      });

      const result = await service.checkout(USER_ID, {
        product_pricing_id: 'pp-1',
        billing_profile_id: 'bp-1',
      });
      expect(result.invoice_type).toBe('completa');
    });

    it('lanza NotFound si el pricing no existe', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(null);
      await expect(
        service.checkout(USER_ID, { product_pricing_id: 'pp-x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('lanza BadRequest si el pricing está inactivo', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture({ active: false }),
      );
      await expect(
        service.checkout(USER_ID, { product_pricing_id: 'pp-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si el producto no está activo', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture({
          product: { name: 'X', type: 'hosting_web', status: 'inactive' },
        }),
      );
      await expect(
        service.checkout(USER_ID, { product_pricing_id: 'pp-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si el billing profile no pertenece al usuario', async () => {
      prisma.billingProfile.findFirst.mockResolvedValue(null);
      await expect(
        service.checkout(USER_ID, {
          product_pricing_id: 'pp-1',
          billing_profile_id: 'bp-otro',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si supera max_quantity_per_client', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture({
          product: {
            name: 'X',
            type: 'hosting_web',
            status: 'active',
            max_quantity_per_client: 1,
          },
        }),
      );
      prisma.service.count.mockResolvedValue(1);
      await expect(
        service.checkout(USER_ID, { product_pricing_id: 'pp-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Path `domain` — ADR-084 §2 + DOM-INV-2/3 ──────────────────────────

  describe('checkoutItems (ítem domain)', () => {
    it('resuelve precio desde domain_tld_pricing y crea el service de dominio', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );

      const result = await service.checkoutItems(USER_ID, {
        items: [
          {
            kind: 'domain',
            productId: 'prod-domain',
            domainName: 'Example.COM',
            operation: 'register',
            years: 1,
          },
        ],
      });

      expect(prisma.domainTldPricing.findUnique).toHaveBeenCalledWith({
        where: {
          registrar_slug_tld_operation_years_price_currency: {
            registrar_slug: 'resellerclub',
            tld: 'com',
            operation: 'register',
            years: 1,
            price_currency: 'EUR',
          },
        },
      });
      // DOM-INV-2: advisory lock por FQDN normalizado (lowercase).
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: USER_ID,
          product_id: 'prod-domain',
          domain: 'example.com',
          provisioner_slug: 'resellerclub',
          billing_cycle: 'annual',
          amount: 12,
          currency: 'EUR',
          metadata: { domain_operation: 'register', domain_years: 1 },
        }),
      });
      const invoiceArg = firstInvoiceArg();
      expect(invoiceArg.items[0].unit_price).toBe(12);
      expect(result.services).toHaveLength(1);
    });

    it('DOM-INV-3: bloquea + alerta si coste > precio (margin guard)', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture({ cost_amount: 15, price_amount: 12 }),
      );

      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.com',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'system.error',
        expect.objectContaining({ module: 'billing.checkout' }),
      );
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('DOM-INV-3: bloquea si las monedas de coste y precio difieren', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture({ cost_currency: 'USD' }),
      );

      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.com',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'system.error',
        expect.objectContaining({ module: 'billing.checkout' }),
      );
    });

    it('lanza BadRequest si no hay precio para el TLD/operación', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(null);
      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.com',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest con años fuera de rango (1..10)', async () => {
      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.com',
              operation: 'register',
              years: 0,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest con FQDN inválido (sin punto)', async () => {
      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'sinpunto',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si el producto no es de tipo domain', async () => {
      prisma.product.findUnique.mockResolvedValue(
        domainProductFixture({ type: 'hosting_web' }),
      );
      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.com',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('DOM-INV-2: dup guard — rechaza si ya existe un service de dominio para el FQDN', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );
      prisma.service.findFirst.mockResolvedValue({ id: 'svc-existente' });

      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.com',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('operation transfer_in resuelve el precio de operación "transfer"', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );

      await service.checkoutItems(USER_ID, {
        items: [
          {
            kind: 'domain',
            productId: 'prod-domain',
            domainName: 'example.com',
            operation: 'transfer_in',
            years: 1,
          },
        ],
      });
      expect(prisma.domainTldPricing.findUnique).toHaveBeenCalledWith({
        where: {
          registrar_slug_tld_operation_years_price_currency:
            expect.objectContaining({ operation: 'transfer' }),
        },
      });
    });

    // ─── DOM-INV-5: elegibilidad pre-checkout (.es/.eu) ──────────────────
    it('DOM-INV-5: .es sin NIF en el perfil → bloqueado antes de cobrar (no crea service)', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );
      prisma.clientProfile.findFirst.mockResolvedValue({
        tax_id: null,
        country: 'ES',
      });

      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.es',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toMatchObject({
        response: { code: 'REGISTRANT_INELIGIBLE' },
      });
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('DOM-INV-5: .es con NIF → procede y crea el service', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );
      prisma.clientProfile.findFirst.mockResolvedValue({
        tax_id: '12345678Z',
        country: 'ES',
      });

      const result = await service.checkoutItems(USER_ID, {
        items: [
          {
            kind: 'domain',
            productId: 'prod-domain',
            domainName: 'example.es',
            operation: 'register',
            years: 1,
          },
        ],
      });
      expect(result.services).toHaveLength(1);
    });

    it('DOM-INV-5: .eu con país no-UE → bloqueado', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );
      prisma.clientProfile.findFirst.mockResolvedValue({
        tax_id: null,
        country: 'US',
      });

      await expect(
        service.checkoutItems(USER_ID, {
          items: [
            {
              kind: 'domain',
              productId: 'prod-domain',
              domainName: 'example.eu',
              operation: 'register',
              years: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('DOM-INV-5: TLD no regulado (.com) NO carga el perfil', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );

      await service.checkoutItems(USER_ID, {
        items: [
          {
            kind: 'domain',
            productId: 'prod-domain',
            domainName: 'example.com',
            operation: 'register',
            years: 1,
          },
        ],
      });
      expect(prisma.clientProfile.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── Multi-ítem (flujo F1: dominio + hosting en un carrito) ────────────

  describe('checkoutItems (multi-ítem F1)', () => {
    it('dominio + producto → 2 services + 1 factura de 2 líneas + eventos por service', async () => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture(),
      );

      const result = await service.checkoutItems(USER_ID, {
        items: [
          {
            kind: 'domain',
            productId: 'prod-domain',
            domainName: 'example.com',
            operation: 'register',
            years: 1,
          },
          { kind: 'product', productPricingId: 'pp-1', domain: 'example.com' },
        ],
      });

      expect(result.services).toHaveLength(2);
      expect(prisma.service.create).toHaveBeenCalledTimes(2);
      const invoiceArg = firstInvoiceArg();
      expect(invoiceArg.items).toHaveLength(2);
      expect(invoiceService.createInvoice).toHaveBeenCalledTimes(1);
      const events = emittedEvents();
      expect(events.filter((c) => c[0] === 'service.provisioned')).toHaveLength(
        2,
      );
      expect(events.filter((c) => c[0] === 'checkout.completed')).toHaveLength(
        2,
      );
    });
  });

  it('lanza BadRequest si no hay ítems', async () => {
    await expect(
      service.checkoutItems(USER_ID, { items: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza NotFound si el usuario destino no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.checkout(USER_ID, { product_pricing_id: 'pp-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /* ── Carrito unificado producto+dominio (Sprint 15D Fase 15D.F.4) ── */
  describe('checkoutCart (carrito unificado — 15D.F.4)', () => {
    function domainProductFixture(overrides: Overrides = {}) {
      return {
        id: 'prod-domain',
        name: 'Dominios',
        type: 'domain',
        status: 'active',
        provisioner: 'resellerclub',
        ...overrides,
      };
    }

    it('carrito mixto (producto + dominio) → resuelve el producto-dominio por capability + delega', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture(),
      );
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );

      const result = await service.checkoutCart(USER_ID, {
        items: [
          { kind: 'product', productPricingId: 'pp-1' },
          { kind: 'domain', domainName: 'aelium.com', years: 1 },
        ],
      });

      // 2 services (hosting + dominio) + 1 factura.
      expect(result.services).toHaveLength(2);
      // Resuelve el producto-dominio por capability (R4), nunca por slug.
      expect(registry.getByCapability).toHaveBeenCalledWith(
        'is_domain_registrar',
      );
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: 'domain',
            provisioner: 'resellerclub',
            status: 'active',
          },
        }),
      );
    });

    it('carrito solo-producto → NO resuelve registrar de dominios', async () => {
      prisma.productPricing.findUnique.mockResolvedValue(
        productPricingFixture(),
      );

      await service.checkoutCart(USER_ID, {
        items: [{ kind: 'product', productPricingId: 'pp-1' }],
      });

      expect(registry.getByCapability).not.toHaveBeenCalled();
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('carrito con dominio pero sin registrar (capability) → ServiceUnavailableException', async () => {
      registry.getByCapability.mockReturnValue(null);
      await expect(
        service.checkoutCart(USER_ID, {
          items: [{ kind: 'domain', domainName: 'aelium.com', years: 1 }],
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('carrito vacío → BadRequestException', async () => {
      await expect(
        service.checkoutCart(USER_ID, { items: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  /* ── Transfer-in deferBilling (Sprint 15D.II.T2c.3, ADR-084 A2.3) ── */
  describe('checkoutItems — transfer_in deferBilling', () => {
    const transferItem = {
      kind: 'domain' as const,
      productId: 'prod-domain',
      domainName: 'midominio.com',
      operation: 'transfer_in' as const,
      years: 1,
    };

    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue(domainProductFixture());
      prisma.domainTldPricing.findUnique.mockResolvedValue(
        domainPricingFixture(),
      );
    });

    it('crea el service pending con transfer_state=pending y NO emite factura (carrito solo-transfers)', async () => {
      const result = await service.checkoutItems(USER_ID, {
        items: [transferItem],
      });

      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'pending',
          domain: 'midominio.com',
          metadata: expect.objectContaining({
            domain_operation: 'transfer_in',
            transfer_state: 'pending',
          }),
        }),
      });
      // Carrito solo-transfers → SIN factura (cobro al completar).
      expect(invoiceService.createInvoice).not.toHaveBeenCalled();
      expect(result.invoice).toBeNull();
      expect(result.services).toHaveLength(1);
    });

    it('NO emite checkout.completed/service.provisioned para un transfer diferido', async () => {
      await service.checkoutItems(USER_ID, { items: [transferItem] });
      const events = emittedEvents();
      expect(events.filter((c) => c[0] === 'service.provisioned')).toHaveLength(
        0,
      );
      expect(events.filter((c) => c[0] === 'checkout.completed')).toHaveLength(
        0,
      );
    });

    it('resuelve el precio con operación `transfer` (no `register`)', async () => {
      await service.checkoutItems(USER_ID, { items: [transferItem] });
      const arg = prisma.domainTldPricing.findUnique.mock.calls[0][0] as {
        where: {
          registrar_slug_tld_operation_years_price_currency: {
            operation: string;
          };
        };
      };
      expect(
        arg.where.registrar_slug_tld_operation_years_price_currency.operation,
      ).toBe('transfer');
    });

    it('carrito mixto register+transfer → factura SOLO el register; el transfer queda pending sin facturar', async () => {
      const result = await service.checkoutItems(USER_ID, {
        items: [
          {
            kind: 'domain',
            productId: 'prod-domain',
            domainName: 'registro.com',
            operation: 'register',
            years: 1,
          },
          transferItem,
        ],
      });

      // 2 services creados, pero la factura tiene 1 sola línea (el register).
      expect(result.services).toHaveLength(2);
      expect(invoiceService.createInvoice).toHaveBeenCalledTimes(1);
      const invoiceArg = firstInvoiceArg();
      expect(invoiceArg.items).toHaveLength(1);
      expect(invoiceArg.items[0]).toMatchObject({
        description: expect.stringContaining('registro.com'),
      });
      expect(result.invoice).not.toBeNull();
      // Eventos solo por el service facturado (el register).
      const events = emittedEvents();
      expect(events.filter((c) => c[0] === 'service.provisioned')).toHaveLength(
        1,
      );
    });
  });
});

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { BillingCycle, Prisma, Service } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  checkTldRegistrantEligibility,
  tldRegistrantRequirement,
} from '../../core/provisioning/registrant-eligibility';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingCalculatorService } from './billing-calculator.service';
import { BillingInvoiceService } from './billing-invoice.service';

/* ═══════════════════════════════════════
   BillingCheckoutService — Checkout flow (multi-ítem)
   Crea N services + 1 factura en una operación.
   Ref: DECISIONS.md §12, §21, §32 · ARCHITECTURE.md Regla 15
   Sprint 15D Fase B — ADR-084 §2 (checkout multi-ítem) + DOM-INV-2/3.
   ═══════════════════════════════════════ */

/**
 * Ítem de checkout discriminado por `kind` (ADR-084 §2).
 *   - `product`: hosting/otros — precio desde `ProductPricing` (flujos F2/F3 + compra actual).
 *   - `domain`:  dominio — precio desde `domain_tld_pricing` (flujos F1/F4/F5).
 */
export type CheckoutItem =
  | {
      kind: 'product';
      productPricingId: string;
      label?: string;
      domain?: string;
    }
  | {
      kind: 'domain';
      productId: string;
      domainName: string;
      operation: 'register' | 'transfer_in';
      years: number;
      label?: string;
    };

export interface CheckoutInput {
  items: CheckoutItem[];
  billingProfileId?: string;
}

/**
 * Ítem del carrito tal como llega del portal cliente (forma pública/REST) —
 * Sprint 15D Fase 15D.F.4 (carrito único producto+dominio). El cliente NO envía
 * el `productId` del dominio (se resuelve server-side por capability R4); para
 * productos envía el `productPricingId` (el plan elegido).
 */
export type PublicCartItem =
  | {
      kind: 'product';
      productPricingId: string;
      label?: string;
      domain?: string;
    }
  | {
      kind: 'domain';
      domainName: string;
      years: number;
      /**
       * Operación del dominio (Sprint 15D.II.T2c.3). `register` (default) cobra
       * en el checkout; `transfer_in` se crea `pending` pero **NO se factura aquí**
       * (deferBilling — cobro al completar, ADR-084 A2.3). El auth-code se aporta
       * post-checkout (`POST /domains/:id/transfer/submit-auth`), nunca en el carrito.
       */
      operation?: 'register' | 'transfer_in';
    };

/**
 * Forma legacy de 1 producto — preserva el contrato REST actual (`CheckoutDto`).
 * El wrapper `checkout()` la adapta al core multi-ítem (`items.length === 1`).
 */
export interface SingleProductCheckoutDto {
  product_pricing_id: string;
  billing_profile_id?: string;
  label?: string;
  domain?: string;
}

/**
 * Moneda de venta por defecto para dominios (ADR-084 A1.2 — moneda única v1:
 * `cost_currency === price_currency === default_currency`). El setting
 * `plugin.<registrar>.default_currency` se cablea en Fase E; hasta entonces, EUR.
 */
const DEFAULT_DOMAIN_CURRENCY = 'EUR';

/**
 * Resultado intermedio de resolver un `CheckoutItem` a (datos de service +
 * línea de factura) ANTES de la transacción. La resolución (lecturas +
 * validación + cálculo de precio) ocurre fuera de la tx; la tx solo crea los
 * services (+ advisory lock para dominios). Espejo del patrón actual.
 */
interface ResolvedLine {
  /** Datos para `prisma.service.create` (sin `user_id`, que se añade en la tx). */
  service: Omit<Prisma.ServiceUncheckedCreateInput, 'user_id'>;
  /** Línea de la factura (sin `service_id`, que se añade tras crear el service). */
  invoiceLine: {
    product_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    setup_fee?: number;
    discount_pct?: number;
    period_start: string;
    period_end: string;
  };
  productName: string;
  productType: string;
  /** Solo para ítems `product` — para el payload `service.provisioned`. */
  productPricingId?: string;
  /** Solo para ítems `domain` — FQDN normalizado (advisory lock + dup guard). */
  fqdn?: string;
  /** Etiqueta de descuento legacy (solo el primer ítem la expone en la respuesta). */
  discountLabel: string | null;
  /**
   * Sprint 15D.II.T2c.3 — `true` para un `transfer_in`: el service se crea
   * `pending` pero se **excluye de la factura** (cobro al completar, ADR-084 A2.3).
   * El listener de billing factura sobre `domain.transfer_completed` (T2c.2). El
   * resto (register/product) factura en el checkout (`false`).
   */
  deferBilling: boolean;
}

@Injectable()
export class BillingCheckoutService {
  private readonly logger = new Logger('BillingCheckoutService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calculator: BillingCalculatorService,
    private readonly invoiceService: BillingInvoiceService,
    private readonly registry: PluginRegistryService,
  ) {}

  /**
   * Checkout del carrito unificado (Sprint 15D Fase 15D.F.4) — ítems mixtos de
   * producto y/o dominio desde el portal cliente. Resuelve el producto-dominio
   * server-side por capability (R4 — `is_domain_registrar`, el cliente nunca
   * envía `productId`) y delega en el core multi-ítem `checkoutItems` (DOM-INV-2/3/5
   * + cálculo de precio R5). Crea N services `pending` + 1 factura.
   */
  async checkoutCart(
    userId: string,
    input: { items: PublicCartItem[]; billingProfileId?: string },
  ): Promise<{
    services: Service[];
    // Sprint 15D.II.T2c.3 — `null` cuando el carrito es SOLO transfers (deferBilling):
    // no se emite factura en el checkout (cobro al completar, ADR-084 A2.3).
    invoice: Awaited<ReturnType<BillingInvoiceService['createInvoice']>> | null;
    invoice_type: 'completa' | 'simplificada';
    discount_applied: string | null;
  }> {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('El carrito está vacío.');
    }

    // Resuelve el producto-dominio UNA vez (si hay ítems de dominio).
    let domainProductId: string | null = null;
    if (input.items.some((i) => i.kind === 'domain')) {
      const plugin = this.registry.getByCapability('is_domain_registrar');
      if (!plugin) {
        throw new ServiceUnavailableException({
          code: 'NO_DOMAIN_REGISTRAR',
          message: 'No hay un registrar de dominios disponible ahora mismo.',
        });
      }
      const product = await this.prisma.product.findFirst({
        where: { type: 'domain', provisioner: plugin.slug, status: 'active' },
        select: { id: true },
        orderBy: { created_at: 'asc' },
      });
      if (!product) {
        throw new ServiceUnavailableException({
          code: 'NO_DOMAIN_PRODUCT',
          message: 'No hay un producto de dominio configurado.',
        });
      }
      domainProductId = product.id;
    }

    const items: CheckoutItem[] = input.items.map((it) =>
      it.kind === 'product'
        ? {
            kind: 'product',
            productPricingId: it.productPricingId,
            label: it.label,
            domain: it.domain,
          }
        : {
            kind: 'domain',
            // `domainProductId` está garantizado no-null aquí (se resolvió arriba
            // porque hay al menos un ítem de dominio).
            productId: domainProductId as string,
            domainName: it.domainName,
            // 15D.II.T2c.3 — `register` por defecto; `transfer_in` activa deferBilling.
            operation: it.operation ?? 'register',
            years: it.years,
          },
    );

    return this.checkoutItems(userId, {
      items,
      billingProfileId: input.billingProfileId,
    });
  }

  /**
   * Checkout de 1 producto — entrada legacy que preserva el contrato REST
   * actual (`POST /billing/checkout`). Adapta el DTO al core multi-ítem y
   * devuelve la MISMA forma de respuesta que antes (`service` singular).
   *
   * El contrato `items[]` público + el carrito (flujo F1 dominio+hosting)
   * llegan con el buscador en Fase F.
   */
  async checkout(
    userId: string,
    dto: SingleProductCheckoutDto,
  ): Promise<{
    service: Service;
    invoice: Awaited<ReturnType<BillingInvoiceService['createInvoice']>>;
    invoice_type: 'completa' | 'simplificada';
    discount_applied: string | null;
  }> {
    const result = await this.checkoutItems(userId, {
      items: [
        {
          kind: 'product',
          productPricingId: dto.product_pricing_id,
          label: dto.label,
          domain: dto.domain,
        },
      ],
      billingProfileId: dto.billing_profile_id,
    });
    // El checkout legacy es SIEMPRE 1 producto (facturable) → invoice nunca nula.
    // (`null` solo ocurre en un carrito de solo-transfers, 15D.II.T2c.3, que no
    // pasa por este wrapper.) Guard defensivo para narrowing del tipo.
    if (!result.invoice) {
      throw new BadRequestException(
        'No se pudo generar la factura del checkout.',
      );
    }
    return {
      service: result.services[0],
      invoice: result.invoice,
      invoice_type: result.invoice_type,
      discount_applied: result.discount_applied,
    };
  }

  /**
   * Core multi-ítem (ADR-084 §2): N ítems → N services (`pending`) + 1 factura
   * con N líneas. Cada service con su `next_due_date` independiente (DH-INV-5).
   * Al pagar (`invoice.paid`), el orquestador procesa cada service por separado.
   */
  async checkoutItems(
    userId: string,
    input: CheckoutInput,
  ): Promise<{
    services: Service[];
    // Sprint 15D.II.T2c.3 — `null` cuando todos los ítems son `transfer_in`
    // (deferBilling): el cobro lo hace el listener al completar (ADR-084 A2.3).
    invoice: Awaited<ReturnType<BillingInvoiceService['createInvoice']>> | null;
    invoice_type: 'completa' | 'simplificada';
    discount_applied: string | null;
  }> {
    // 1. Validar usuario destino.
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!targetUser)
      throw new NotFoundException('Usuario destino no encontrado.');

    // 2. Validar que hay ítems.
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('El checkout debe tener al menos un ítem.');
    }

    // 3. Validar perfil de facturación (pertenece al usuario destino — 7.0.3).
    let billingProfile: Prisma.BillingProfileGetPayload<object> | null = null;
    if (input.billingProfileId) {
      billingProfile = await this.prisma.billingProfile.findFirst({
        where: { id: input.billingProfileId, user_id: userId },
      });
      if (!billingProfile)
        throw new BadRequestException(
          'El perfil de facturación no pertenece al cliente seleccionado.',
        );
    }

    // 4. Resolver cada ítem (lecturas + validación + precio) fuera de la tx.
    //    `productCartCount` acumula cantidades del mismo producto DENTRO del
    //    carrito para que `max_quantity_per_client` no se evada con duplicados.
    const productCartCount = new Map<string, number>();
    const resolvedLines: ResolvedLine[] = [];
    for (const item of input.items) {
      const line =
        item.kind === 'product'
          ? await this.resolveProductItem(
              userId,
              item,
              input.billingProfileId,
              productCartCount,
            )
          : await this.resolveDomainItem(userId, item, input.billingProfileId);
      resolvedLines.push(line);
    }

    // 5. Crear los N services en una transacción.
    //    DOM-INV-2 (checkout side): advisory lock por FQDN + guard anti-duplicado
    //    para serializar checkouts concurrentes del mismo dominio (EC-15D-03).
    const services = await this.prisma.$transaction(async (tx) => {
      for (const line of resolvedLines) {
        if (line.fqdn) {
          // Lock transaccional por hash del FQDN — dos checkouts simultáneos del
          // mismo nombre se serializan; el segundo ve el service ya creado.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${line.fqdn}))`;
          const existing = await tx.service.findFirst({
            where: {
              domain: line.fqdn,
              status: { notIn: ['cancelled', 'terminated'] },
              product: { type: 'domain' },
            },
            select: { id: true },
          });
          if (existing) {
            throw new BadRequestException(
              `El dominio ${line.fqdn} ya está gestionado por Aelium.`,
            );
          }
        }
      }
      const created: Service[] = [];
      for (const line of resolvedLines) {
        created.push(
          await tx.service.create({
            data: { user_id: userId, ...line.service },
          }),
        );
      }
      return created;
    });

    // 6. Facturar SOLO los ítems facturables (15D.II.T2c.3): un `transfer_in` es
    //    deferBilling — el service se crea `pending` pero NO entra en la factura
    //    del checkout (cobro al completar, ADR-084 A2.3; lo factura el listener
    //    sobre `domain.transfer_completed`, T2c.2). Si TODO el carrito es transfers,
    //    no se emite factura (`invoice = null`) — el carrito puede ser solo-transfers.
    const billable = resolvedLines
      .map((line, i) => ({ line, service: services[i] }))
      .filter((p) => !p.line.deferBilling);

    let invoice: Awaited<
      ReturnType<BillingInvoiceService['createInvoice']>
    > | null = null;
    if (billable.length > 0) {
      // Crear la factura (fuera de la tx — usa SEQUENCE) con las líneas facturables.
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      invoice = await this.invoiceService.createInvoice({
        user_id: userId,
        billing_profile_id: input.billingProfileId,
        due_date: dueDate.toISOString(),
        // Moneda de la factura = la del primer service facturable (en v1 todos los
        // ítems comparten moneda — productos en su `currency`, dominios en EUR).
        currency: billable[0].service.currency,
        items: billable.map(({ line, service }) => ({
          service_id: service.id,
          product_id: line.invoiceLine.product_id,
          description: line.invoiceLine.description,
          quantity: line.invoiceLine.quantity,
          unit_price: line.invoiceLine.unit_price,
          setup_fee: line.invoiceLine.setup_fee,
          discount_pct: line.invoiceLine.discount_pct,
          period_start: line.invoiceLine.period_start,
          period_end: line.invoiceLine.period_end,
        })),
      });
    }

    const deferredCount = services.length - billable.length;
    this.logger.log(
      `Checkout complete: ${services.length} service(s) ` +
        `(${billable.length} facturado/s, ${deferredCount} diferido/s) + ` +
        `${invoice ? `Invoice ${invoice.invoice_number}` : 'sin factura (cobro al completar)'} ` +
        `for user ${userId}.`,
    );

    // 7. Emitir eventos SOLO por los services facturados. Los `transfer_in`
    //    diferidos NO se aprovisionan en el checkout (su FSM arranca cuando el
    //    cliente aporta el auth-code vía `initiateTransferIn`, T2c.1) → no emiten
    //    `checkout.completed`/`service.provisioned`.
    if (invoice) {
      for (const { line, service } of billable) {
        this.eventEmitter.emit('checkout.completed', {
          user_id: userId,
          service_id: service.id,
          invoice_id: invoice.id,
          product_name: line.productName,
          total: invoice.total,
        });

        // ADR-076 + sub-fase 8.D.12.9 — `service.provisioned` canónico. El
        // listener `support-inside-on-service-provisioned` filtra por
        // `product_type='support_inside'`; el orquestador Sprint 11 provisiona
        // vía `invoice.paid`. Heredado sin cambios para los ítems `domain`
        // de `register` (product_type='domain' → plugin registrar).
        this.eventEmitter.emit('service.provisioned', {
          service_id: service.id,
          user_id: userId,
          product_id: line.invoiceLine.product_id,
          product_type: line.productType,
          product_pricing_id: line.productPricingId,
          invoice_id: invoice.id,
          billing_profile_id: input.billingProfileId,
        });
      }
    }

    return {
      services,
      invoice,
      invoice_type: billingProfile?.nif_cif ? 'completa' : 'simplificada',
      discount_applied: resolvedLines[0].discountLabel,
    };
  }

  /**
   * Resuelve un ítem `product` — lógica idéntica al checkout 1-producto previo
   * (validación de pricing + producto activo + `max_quantity_per_client` +
   * descuento + fechas de ciclo). Preserva el comportamiento existente.
   */
  private async resolveProductItem(
    userId: string,
    item: Extract<CheckoutItem, { kind: 'product' }>,
    billingProfileId: string | undefined,
    productCartCount: Map<string, number>,
  ): Promise<ResolvedLine> {
    const pricing = await this.prisma.productPricing.findUnique({
      where: { id: item.productPricingId },
      include: { product: true },
    });
    if (!pricing) throw new NotFoundException('Plan de precios no encontrado.');
    if (!pricing.active)
      throw new BadRequestException('Este plan de precios no está activo.');
    if (pricing.product.status !== 'active')
      throw new BadRequestException('Este producto no está disponible.');

    // max_quantity_per_client — cuenta servicios existentes + los ya añadidos
    // a ESTE carrito para el mismo producto (no se evade con duplicados).
    if (pricing.product.max_quantity_per_client) {
      const existingCount = await this.prisma.service.count({
        where: {
          user_id: userId,
          product_id: pricing.product_id,
          status: { notIn: ['cancelled', 'terminated'] },
        },
      });
      const inCart = productCartCount.get(pricing.product_id) ?? 0;
      if (existingCount + inCart >= pricing.product.max_quantity_per_client) {
        throw new BadRequestException(
          `El cliente ha alcanzado el límite de ${pricing.product.max_quantity_per_client} servicio(s) de este tipo.`,
        );
      }
      productCartCount.set(pricing.product_id, inCart + 1);
    }

    const basePrice = Number(pricing.price);
    const discountPct = pricing.discount_percentage
      ? Number(pricing.discount_percentage)
      : 0;
    const discountedPrice =
      discountPct > 0
        ? Math.round(basePrice * (1 - discountPct / 100) * 100) / 100
        : basePrice;

    const cycleDays = this.calculator.getCycleDays(pricing.billing_cycle);
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + cycleDays);

    return {
      service: {
        product_id: pricing.product_id,
        billing_profile_id: billingProfileId,
        status: 'pending',
        label: item.label,
        domain: item.domain,
        billing_cycle: pricing.billing_cycle,
        amount: discountedPrice,
        currency: pricing.currency,
        next_due_date: nextDueDate,
        next_invoice_date: nextDueDate,
      },
      invoiceLine: {
        product_id: pricing.product_id,
        description: `${pricing.product.name} — ${item.label || item.domain || 'Nuevo servicio'}`,
        quantity: 1,
        unit_price: discountedPrice,
        setup_fee: Number(pricing.setup_fee),
        discount_pct: discountPct > 0 ? discountPct : undefined,
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + cycleDays * 86400_000).toISOString(),
      },
      productName: pricing.product.name,
      productType: pricing.product.type,
      productPricingId: pricing.id,
      discountLabel: discountPct > 0 ? `${discountPct}%` : null,
      deferBilling: false, // los productos se cobran en el checkout.
    };
  }

  /**
   * Resuelve un ítem `domain` (ADR-084 §2) — precio desde `domain_tld_pricing`
   * (NO `ProductPricing`, R5: precio siempre en backend) + DOM-INV-3 (guardia
   * de margen, moneda única). El service se crea con `domain=FQDN`,
   * `provisioner_slug` del producto y `metadata` con la operación/años para que
   * el orquestador fije `ProvisionContext.operation` (Fase sub-4).
   */
  private async resolveDomainItem(
    userId: string,
    item: Extract<CheckoutItem, { kind: 'domain' }>,
    billingProfileId: string | undefined,
  ): Promise<ResolvedLine> {
    if (!Number.isInteger(item.years) || item.years < 1 || item.years > 10) {
      throw new BadRequestException('Años de dominio inválidos (1..10).');
    }
    const fqdn = item.domainName.trim().toLowerCase();
    const parts = fqdn.split('.');
    if (parts.length < 2 || parts.some((p) => p.length === 0)) {
      throw new BadRequestException(`Dominio inválido: ${item.domainName}.`);
    }
    // TLD = todo lo que sigue a la primera etiqueta. v1 ofrece TLDs de un solo
    // nivel (.com/.net/.org/.es/.eu); el lookup en `domain_tld_pricing` es la
    // fuente de verdad — TLDs multi-nivel/IDN se abordan en 15D.II.
    const tld = parts.slice(1).join('.');

    // Producto de dominio (define el registrar via `product.provisioner`).
    const product = await this.prisma.product.findUnique({
      where: { id: item.productId },
    });
    if (!product)
      throw new NotFoundException('Producto de dominio no encontrado.');
    if (product.type !== 'domain')
      throw new BadRequestException(
        'El producto indicado no es de tipo dominio.',
      );
    if (product.status !== 'active')
      throw new BadRequestException('Este producto no está disponible.');

    // Operación de pricing: el checkout solo vende register/transfer en v1.
    const priceOperation =
      item.operation === 'transfer_in' ? 'transfer' : 'register';
    const pricing = await this.prisma.domainTldPricing.findUnique({
      where: {
        registrar_slug_tld_operation_years_price_currency: {
          registrar_slug: product.provisioner,
          tld,
          operation: priceOperation,
          years: item.years,
          price_currency: DEFAULT_DOMAIN_CURRENCY,
        },
      },
    });
    if (!pricing || !pricing.active) {
      throw new BadRequestException(
        `No hay precio disponible para .${tld} (${priceOperation}, ${item.years} año/s).`,
      );
    }

    // DOM-INV-3 (margin guard, ADR-084 A1) — same-currency (A1.2). Bloquea la
    // venta a pérdida por pricing dessincronizado + alerta superadmin.
    if (pricing.cost_currency !== pricing.price_currency) {
      this.emitMarginGuardAlert(fqdn, pricing, 'currency_mismatch');
      throw new BadRequestException(
        'Pricing de dominio incoherente (moneda). Operación bloqueada.',
      );
    }
    if (Number(pricing.cost_amount) > Number(pricing.price_amount)) {
      this.emitMarginGuardAlert(fqdn, pricing, 'cost_exceeds_price');
      throw new BadRequestException(
        'Precio de dominio temporalmente no disponible. Inténtalo más tarde.',
      );
    }

    // DOM-INV-5 (ADR-084 §3) — elegibilidad de registrante ANTES de cobrar para
    // TLDs regulados (.es→NIF/NIE, .eu→residencia UE). Si el perfil no cumple, se
    // bloquea el checkout con un mensaje accionable (nunca se cobra para que el
    // registro falle después). Solo se carga el perfil si el TLD lo requiere. El
    // plugin mantiene su defensa al register como backstop (REGISTRANT_INELIGIBLE).
    if (tldRegistrantRequirement(tld)) {
      const profile = await this.prisma.clientProfile.findFirst({
        where: { user_id: userId },
        select: { tax_id: true, country: true },
      });
      const eligibility = checkTldRegistrantEligibility(tld, {
        taxId: profile?.tax_id,
        countryCode: profile?.country,
      });
      if (!eligibility.eligible) {
        throw new BadRequestException({
          code: 'REGISTRANT_INELIGIBLE',
          message: eligibility.reason,
          tld,
        });
      }
    }

    const price = Number(pricing.price_amount);
    const isTransfer = item.operation === 'transfer_in';
    const now = new Date();
    const nextDueDate = new Date(now);
    nextDueDate.setFullYear(now.getFullYear() + item.years);

    return {
      service: {
        product_id: product.id,
        billing_profile_id: billingProfileId,
        status: 'pending',
        label: item.label ?? fqdn,
        domain: fqdn,
        provisioner_slug: product.provisioner,
        billing_cycle: BillingCycle.annual,
        // Precio snapshotado en el service. Para un `transfer_in` (deferBilling) NO
        // se factura ahora; el listener de billing lo usa al completar (`services.amount`,
        // ADR-084 A2.3 / T2c.2).
        amount: price,
        currency: pricing.price_currency,
        next_due_date: nextDueDate,
        next_invoice_date: nextDueDate,
        // El orquestador (sub-4) lee la operación para fijar
        // `ProvisionContext.operation` (ADR-077 A10) y los años del registro. Para
        // `transfer_in`, además inicializa la FSM en `transfer_state='pending'`
        // (ADR-084 A2.1) — el transfer arranca cuando el cliente aporta el auth-code.
        metadata: {
          domain_operation: item.operation,
          domain_years: item.years,
          ...(isTransfer ? { transfer_state: 'pending' } : {}),
        } satisfies Prisma.InputJsonValue,
      },
      invoiceLine: {
        product_id: product.id,
        description: `${product.name} — ${fqdn} (${isTransfer ? 'transferencia' : 'registro'}, ${item.years} año/s)`,
        quantity: 1,
        unit_price: price,
        period_start: now.toISOString(),
        period_end: nextDueDate.toISOString(),
      },
      productName: product.name,
      productType: product.type,
      fqdn,
      discountLabel: null,
      // 15D.II.T2c.3 — un transfer-in se difiere (cobro al completar); el registro
      // se factura en el checkout.
      deferBilling: isTransfer,
    };
  }

  /** DOM-INV-3 — alerta al superadmin cuando el margen de un dominio es inválido. */
  private emitMarginGuardAlert(
    fqdn: string,
    pricing: {
      cost_amount: unknown;
      price_amount: unknown;
      cost_currency: string;
      price_currency: string;
    },
    reason: 'cost_exceeds_price' | 'currency_mismatch',
  ): void {
    this.eventEmitter.emit('system.error', {
      level: 'error',
      module: 'billing.checkout',
      message:
        `DOM-INV-3 margin guard: checkout de dominio ${fqdn} bloqueado (${reason}). ` +
        `cost=${String(pricing.cost_amount)} ${pricing.cost_currency} ` +
        `price=${String(pricing.price_amount)} ${pricing.price_currency}.`,
    });
  }
}

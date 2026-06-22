import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';

import { getErrorMessage } from '../../core/common/utils/error.util';
import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  BillingCheckoutService,
  type CheckoutItem,
} from '../billing/billing-checkout.service';

/**
 * Moneda de venta v1 (ADR-084 A1.2 — moneda única). Misma constante que el
 * checkout (`BillingCheckoutService`); el lookup de precio filtra por ella.
 */
const DEFAULT_DOMAIN_CURRENCY = 'EUR';

/** Disponibilidad + precio de venta de un FQDN concreto (un TLD del SLD). */
export interface DomainAvailabilityResult {
  fqdn: string;
  tld: string;
  available: boolean;
  /** El registrar lo marca premium (precio dinámico) → bloqueado en v1. */
  premium: boolean;
  /** `available && !premium && con precio` → se puede añadir al checkout. */
  purchasable: boolean;
  /** Precio de venta (server-side, `domain_tld_pricing`). Solo si purchasable. */
  price?: { amount: string; currency: string };
  /** El registrar falló para este TLD (no rompe el resto del lote). */
  error?: boolean;
}

export interface CheckDomainAvailabilityResponse {
  sld: string;
  results: DomainAvailabilityResult[];
}

/** Una fila de "Mis dominios" (`GET /domains`). */
export interface DomainListItem {
  /** `service.id` — id del recurso para el detalle/gestión. */
  id: string;
  /** FQDN registrado (`service.domain`). */
  fqdn: string | null;
  /** Estado del service (active/pending/suspended/...). */
  status: string;
  /** Caducidad REAL reportada por el registrar (`service.expires_at`), si se conoce. */
  expires_at: string | null;
  /** Próxima fecha de facturación de Aelium (`service.next_due_date`). */
  next_due_date: string | null;
  created_at: string;
  product_name: string;
}

export interface ListDomainsResponse {
  data: DomainListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Resumen del checkout del carrito de dominios (`POST /domains/cart/checkout`). */
export interface CartCheckoutResult {
  invoice_id: string;
  invoice_number: string;
  total: string;
  currency: string;
  /** Services creados (uno por dominio), en estado `pending` hasta el pago. */
  services: { id: string; fqdn: string | null }[];
}

/** Ítem del carrito tal como llega del controller (forma REST → camelCase interno). */
export interface CartDomainInput {
  domainName: string;
  years: number;
}

/**
 * Sprint 15D Fase 15D.F.2 — buscador de dominios (pre-venta).
 *
 * Resuelve el registrar **por capability** (`is_domain_registrar`, R4 — NUNCA
 * por slug), consulta disponibilidad por TLD y adjunta el precio de venta
 * resuelto server-side desde `domain_tld_pricing` (R5, ADR-084 §1). Los TLDs
 * ofertables se derivan de las filas activas de precio de registro (lo que tiene
 * precio = lo que se puede vender), sin depender de un setting aparte.
 *
 * Robusto: un fallo del registrar para un TLD concreto NO tumba el lote (ese TLD
 * se devuelve con `error:true`); premium → bloqueado v1 (`purchasable:false`).
 */
@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly registry: PluginRegistryService,
    private readonly prisma: PrismaService,
    private readonly billingCheckout: BillingCheckoutService,
  ) {}

  async checkAvailability(input: {
    sld: string;
    tlds?: string[];
  }): Promise<CheckDomainAvailabilityResponse> {
    const plugin = this.registry.getByCapability('is_domain_registrar');
    if (!plugin || typeof plugin.checkDomainAvailability !== 'function') {
      throw new ServiceUnavailableException({
        code: 'NO_DOMAIN_REGISTRAR',
        message: 'No hay un registrar de dominios disponible ahora mismo.',
      });
    }
    // Capturamos la función ya narrowed (el `typeof` la estrecha en este scope)
    // preservando `this` del plugin (usa `this.getApiClient`).
    const checkAvailability = plugin.checkDomainAvailability.bind(plugin);

    const sld = input.sld.trim().toLowerCase();

    // TLDs ofertables = filas activas de precio de REGISTRO (1 año) del registrar.
    const pricingRows = await this.prisma.domainTldPricing.findMany({
      where: {
        registrar_slug: plugin.slug,
        operation: 'register',
        years: 1,
        active: true,
        price_currency: DEFAULT_DOMAIN_CURRENCY,
      },
      select: { tld: true, price_amount: true, price_currency: true },
    });
    const priceByTld = new Map(
      pricingRows.map((r) => [
        r.tld,
        { amount: r.price_amount.toFixed(2), currency: r.price_currency },
      ]),
    );

    const requested = input.tlds
      ?.map((t) => t.trim().toLowerCase().replace(/^\./, ''))
      .filter((t) => t.length > 0);
    // Solo se consultan TLDs con precio (lo no-tarifado no es vendible — R5).
    const tldsToCheck =
      requested && requested.length > 0
        ? requested.filter((t) => priceByTld.has(t))
        : [...priceByTld.keys()];

    if (tldsToCheck.length === 0) {
      return { sld, results: [] };
    }

    const results = await Promise.all(
      tldsToCheck.map(async (tld): Promise<DomainAvailabilityResult> => {
        const fqdn = `${sld}.${tld}`;
        const price = priceByTld.get(tld);
        try {
          const avail = await checkAvailability(fqdn);
          const purchasable =
            avail.available && !avail.premium && price !== undefined;
          return {
            fqdn,
            tld,
            available: avail.available,
            premium: avail.premium,
            purchasable,
            ...(purchasable ? { price } : {}),
          };
        } catch (err) {
          this.logger.warn(
            `checkAvailability ${fqdn} falló en el registrar: ${getErrorMessage(err)}`,
          );
          return {
            fqdn,
            tld,
            available: false,
            premium: false,
            purchasable: false,
            error: true,
          };
        }
      }),
    );

    return { sld, results };
  }

  /**
   * "Mis dominios" — lista paginada de los `services` de tipo dominio del
   * usuario. Lee `services.expires_at` (poblado por el reconcile cron, 15D.E)
   * directamente de la columna — NO llama al registrar por fila (barato). El
   * estado de gestión rico (NS/lock/privacy) vive en el detalle (`getServiceInfo`).
   */
  async listMine(
    userId: string,
    query: { status?: string; page?: number; limit?: number },
  ): Promise<ListDomainsResponse> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const statusFilter =
      query.status &&
      (Object.values(ServiceStatus) as string[]).includes(query.status)
        ? (query.status as ServiceStatus)
        : undefined;

    const where: Prisma.ServiceWhereInput = {
      user_id: userId,
      product: { type: 'domain' },
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          domain: true,
          status: true,
          expires_at: true,
          next_due_date: true,
          created_at: true,
          product: { select: { name: true } },
        },
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        fqdn: r.domain,
        status: r.status,
        expires_at: r.expires_at?.toISOString() ?? null,
        next_due_date: r.next_due_date?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
        product_name: r.product.name,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Checkout del carrito de dominios: resuelve el registrar por capability (R4)
   * y SU producto de dominio (`product.type='domain'`, server-side — el cliente
   * nunca envía `product_id`), arma los ítems `kind:'domain'` y delega en el
   * core multi-ítem (`BillingCheckoutService.checkoutItems`). Ahí se aplican
   * DOM-INV-2 (advisory lock por FQDN), DOM-INV-3 (margin guard) y DOM-INV-5
   * (elegibilidad `.es`/`.eu` ANTES de cobrar). Crea N services `pending` + 1
   * factura `draft`; el orquestador registra cada dominio al pagar.
   */
  async checkoutCart(
    userId: string,
    input: { items: CartDomainInput[]; billingProfileId?: string },
  ): Promise<CartCheckoutResult> {
    const plugin = this.registry.getByCapability('is_domain_registrar');
    if (!plugin) {
      throw new ServiceUnavailableException({
        code: 'NO_DOMAIN_REGISTRAR',
        message: 'No hay un registrar de dominios disponible ahora mismo.',
      });
    }

    // El producto de dominio del registrar activo (ADR-084 §1: uno por registrar).
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

    const items: CheckoutItem[] = input.items.map((it) => ({
      kind: 'domain',
      productId: product.id,
      domainName: it.domainName,
      operation: 'register',
      years: it.years,
    }));

    const result = await this.billingCheckout.checkoutItems(userId, {
      items,
      billingProfileId: input.billingProfileId,
    });

    return {
      invoice_id: result.invoice.id,
      invoice_number: result.invoice.invoice_number,
      total: result.invoice.total.toString(),
      currency: result.invoice.currency,
      services: result.services.map((s) => ({ id: s.id, fqdn: s.domain })),
    };
  }
}

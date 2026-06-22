import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { getErrorMessage } from '../../core/common/utils/error.util';
import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';

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
}

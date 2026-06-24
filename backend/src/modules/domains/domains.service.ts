import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';

import { getErrorMessage } from '../../core/common/utils/error.util';
import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  DomainSuggestion,
  ProvisionerPluginError,
} from '../../core/provisioning/types';
import { ProvisioningOrchestratorService } from '../provisioning/provisioning-orchestrator.service';

/**
 * Moneda de venta v1 (ADR-084 A1.2 — moneda única). Misma constante que el
 * checkout (`BillingCheckoutService`); el lookup de precio filtra por ella.
 */
const DEFAULT_DOMAIN_CURRENCY = 'EUR';

/** Buscador rico (15D.II.S): caps defensivos del fan-out al registrar. */
const MAX_BULK_SLDS = 10;
const SUGGEST_MAX_RESULTS = 12;
/** Etiqueta DNS válida (SLD sin punto). */
const SLD_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** El registrar resuelto por capability (`is_domain_registrar`). */
type RegistrarPlugin = NonNullable<
  ReturnType<PluginRegistryService['getByCapability']>
>;

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

/** Buscador BULK (15D.II.S): resultados agrupados por SLD. */
export interface BulkAvailabilityResponse {
  results: Array<{ sld: string; results: DomainAvailabilityResult[] }>;
}

/** Una sugerencia comprable del buscador rico (15D.II.S). */
export interface DomainSuggestionResult {
  fqdn: string;
  tld: string;
  price: { amount: string; currency: string };
}

export interface DomainSuggestionsResponse {
  keyword: string;
  results: DomainSuggestionResult[];
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

/** Cotización de transferencia de un FQDN (`POST /domains/transfer-quote`). */
export interface DomainTransferQuote {
  fqdn: string;
  tld: string;
  /** El TLD se transfiere (precio activo + margen válido) → añadible al carrito. */
  offered: boolean;
  /** Precio de venta del transfer (server-side). Solo si `offered`. */
  price?: { amount: string; currency: string };
}

/** Estado de un transfer-in tras aportar el auth-code (`submit-auth`). */
export interface DomainTransferStatus {
  id: string;
  status: string;
  /** Estado de la FSM (`pending`/`awaiting_auth`/`submitted`/...). */
  transfer_state: string;
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
    // 15D.II.T2c.3 — la submisión del auth-code arranca la FSM de transfer vía
    // `initiateTransferIn` (síncrona, auth-code en memoria R12). `ProvisioningModule`
    // ya está importado por `DomainsModule` y exporta el orquestador.
    private readonly orchestrator: ProvisioningOrchestratorService,
  ) {}

  async checkAvailability(input: {
    sld: string;
    tlds?: string[];
  }): Promise<CheckDomainAvailabilityResponse> {
    const { plugin, priceByTld } = await this.resolveRegistrarPricing();
    const sld = input.sld.trim().toLowerCase();
    const results = await this.checkSld(plugin, priceByTld, sld, input.tlds);
    return { sld, results };
  }

  /**
   * Buscador BULK (15D.II.S, ADR-081 A7.3): comprueba **varios SLDs** × las
   * extensiones ofertadas en una sola operación (reusa la lógica per-SLD; resuelve
   * registrar + pricing UNA vez). Cap defensivo de SLDs para acotar el fan-out al
   * registrar; deduplica + descarta SLDs inválidos.
   */
  async checkAvailabilityBulk(input: {
    slds: string[];
    tlds?: string[];
  }): Promise<BulkAvailabilityResponse> {
    const { plugin, priceByTld } = await this.resolveRegistrarPricing();
    const slds = [
      ...new Set(
        input.slds
          .map((s) => s.trim().toLowerCase())
          .filter((s) => SLD_RE.test(s)),
      ),
    ].slice(0, MAX_BULK_SLDS);
    const groups = await Promise.all(
      slds.map(async (sld) => ({
        sld,
        results: await this.checkSld(plugin, priceByTld, sld, input.tlds),
      })),
    );
    return { results: groups };
  }

  /**
   * Buscador RICO (15D.II.S, ADR-081 A7.3): sugiere nombres a partir de una palabra
   * clave (`suggestDomainNames` del registrar, capability-driven) y los enriquece
   * con el precio de venta server-side (R5). Solo devuelve sugerencias **comprables**
   * (disponibles, tarifadas, no premium). Fail-soft: si el registrar no soporta
   * sugerencias o falla → lista vacía (el buscador exacto sigue funcionando).
   */
  async suggestDomains(input: {
    keyword: string;
    tlds?: string[];
  }): Promise<DomainSuggestionsResponse> {
    const keyword = input.keyword.trim().toLowerCase();
    const { plugin, priceByTld } = await this.resolveRegistrarPricing();
    if (typeof plugin.suggestDomainNames !== 'function') {
      return { keyword, results: [] };
    }

    // Las extensiones sugeridas se acotan a las ofertadas/tarifadas (R5).
    const requested = input.tlds
      ?.map((t) => t.trim().toLowerCase().replace(/^\./, ''))
      .filter((t) => priceByTld.has(t));
    const tlds =
      requested && requested.length > 0 ? requested : [...priceByTld.keys()];
    if (keyword.length === 0 || tlds.length === 0) {
      return { keyword, results: [] };
    }

    let raw: readonly DomainSuggestion[] = [];
    try {
      raw = await plugin.suggestDomainNames(keyword, {
        tlds,
        maxResults: SUGGEST_MAX_RESULTS,
      });
    } catch (err) {
      this.logger.warn(
        `suggestDomains "${keyword}" falló en el registrar: ${getErrorMessage(err)}`,
      );
      return { keyword, results: [] };
    }

    const seen = new Set<string>();
    const results: DomainSuggestionResult[] = [];
    for (const s of raw) {
      const price = priceByTld.get(s.tld);
      // Solo comprables: disponible + tarifado (lo no-tarifado no se vende — R5).
      if (!s.available || !price || seen.has(s.fqdn)) continue;
      seen.add(s.fqdn);
      results.push({ fqdn: s.fqdn, tld: s.tld, price });
      if (results.length >= SUGGEST_MAX_RESULTS) break;
    }
    return { keyword, results };
  }

  /**
   * Resuelve el registrar por capability (R4) + la matriz de precios de venta
   * (filas activas de REGISTRO 1 año). Punto único compartido por los tres
   * buscadores (exacto / bulk / sugerencias). Lanza si no hay registrar.
   */
  private async resolveRegistrarPricing(): Promise<{
    plugin: RegistrarPlugin;
    priceByTld: Map<string, { amount: string; currency: string }>;
  }> {
    const plugin = this.registry.getByCapability('is_domain_registrar');
    if (!plugin) {
      throw new ServiceUnavailableException({
        code: 'NO_DOMAIN_REGISTRAR',
        message: 'No hay un registrar de dominios disponible ahora mismo.',
      });
    }
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
    return { plugin, priceByTld };
  }

  /**
   * Lógica de disponibilidad de UN SLD × las extensiones tarifadas. Robusto: un
   * fallo del registrar para un TLD concreto NO tumba el lote (ese TLD → `error:true`);
   * premium → bloqueado v1 (`purchasable:false`). Compartida por exacto + bulk.
   */
  private async checkSld(
    plugin: RegistrarPlugin,
    priceByTld: Map<string, { amount: string; currency: string }>,
    sld: string,
    requestedTlds?: string[],
  ): Promise<DomainAvailabilityResult[]> {
    if (typeof plugin.checkDomainAvailability !== 'function') {
      throw new ServiceUnavailableException({
        code: 'NO_DOMAIN_REGISTRAR',
        message: 'No hay un registrar de dominios disponible ahora mismo.',
      });
    }
    // `this` del plugin preservado (usa `this.getApiClient`).
    const checkAvailability = plugin.checkDomainAvailability.bind(plugin);

    const requested = requestedTlds
      ?.map((t) => t.trim().toLowerCase().replace(/^\./, ''))
      .filter((t) => t.length > 0);
    // Solo se consultan TLDs con precio (lo no-tarifado no es vendible — R5).
    const tldsToCheck =
      requested && requested.length > 0
        ? requested.filter((t) => priceByTld.has(t))
        : [...priceByTld.keys()];
    if (tldsToCheck.length === 0) return [];

    return Promise.all(
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
   * Cotización de transferencia (Sprint 15D.II.T2c.3) — precio de venta del
   * transfer de un FQDN, resuelto server-side (R5) desde `domain_tld_pricing`
   * (operación `transfer`, 1 año). Es PRE-carrito y solo-pricing: NO valida
   * transferibilidad ni toca la API del registrar (eso ocurre POST-checkout, con
   * el auth-code, en `initiateTransferIn`). `offered:false` si el TLD no se
   * transfiere o el margen es inválido (DOM-INV-3 same-currency) — el checkout es
   * la autoridad y bloquearía igualmente.
   */
  async transferQuote(rawFqdn: string): Promise<DomainTransferQuote> {
    const plugin = this.registry.getByCapability('is_domain_registrar');
    if (!plugin) {
      throw new ServiceUnavailableException({
        code: 'NO_DOMAIN_REGISTRAR',
        message: 'No hay un registrar de dominios disponible ahora mismo.',
      });
    }
    const fqdn = rawFqdn.trim().toLowerCase();
    const parts = fqdn.split('.');
    if (parts.length < 2 || parts.some((p) => p.length === 0)) {
      throw new BadRequestException(`Dominio inválido: ${rawFqdn}.`);
    }
    const tld = parts.slice(1).join('.');

    const pricing = await this.prisma.domainTldPricing.findUnique({
      where: {
        registrar_slug_tld_operation_years_price_currency: {
          registrar_slug: plugin.slug,
          tld,
          operation: 'transfer',
          years: 1,
          price_currency: DEFAULT_DOMAIN_CURRENCY,
        },
      },
    });

    // DOM-INV-3 same-currency (ADR-084 A1.2): no ofertar sin precio activo o con
    // margen inválido. El quote es informativo; el precio real se re-resuelve al
    // completar (T2c.2) — nunca se cachea el del quote.
    const offered =
      !!pricing &&
      pricing.active &&
      pricing.cost_currency === pricing.price_currency &&
      Number(pricing.cost_amount) <= Number(pricing.price_amount);

    return {
      fqdn,
      tld,
      offered,
      ...(offered && pricing
        ? {
            price: {
              amount: pricing.price_amount.toFixed(2),
              currency: pricing.price_currency,
            },
          }
        : {}),
    };
  }

  /**
   * Submisión del EPP auth-code de un transfer-in (Sprint 15D.II.T2c.3). El dueño
   * del service (o un admin) lo aporta DESPUÉS del checkout; arranca la FSM vía
   * `initiateTransferIn` (síncrono). **R12:** el `authCode` viaja en memoria — NUNCA
   * se loguea ni se persiste en claro.
   *
   * Guardas: el service debe ser un dominio en `transfer_in` y en un estado donde
   * aportar el código tenga sentido (`pending`/`awaiting_auth`, o `failed`/`cancelled`
   * como **reintento** A2.5 → reabre a `pending`). Un `INVALID_AUTH_CODE` deja la FSM
   * en `awaiting_auth` y se traduce a un 400 accionable (reintentar con un código
   * corregido); `TRANSFER_REJECTED` y otros, a un 400 con el código semántico.
   */
  async submitTransferAuthCode(
    serviceId: string,
    authCode: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<DomainTransferStatus> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        user_id: true,
        status: true,
        metadata: true,
        product: { select: { type: true } },
      },
    });
    if (!service) throw new NotFoundException('Dominio no encontrado.');
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este dominio.');
    }
    if (service.product.type !== 'domain') {
      throw new BadRequestException('El servicio no es un dominio.');
    }

    const meta =
      service.metadata &&
      typeof service.metadata === 'object' &&
      !Array.isArray(service.metadata)
        ? (service.metadata as Record<string, unknown>)
        : {};
    if (meta.domain_operation !== 'transfer_in') {
      throw new BadRequestException(
        'Este dominio no es una transferencia entrante.',
      );
    }
    const state =
      typeof meta.transfer_state === 'string' ? meta.transfer_state : 'pending';
    // Reintento (A2.5): desde `failed`/`cancelled` se reabre el MISMO service. El
    // resto de estados terminales/en-curso (`submitted`/`completed`) no admiten código.
    const isRetry = state === 'failed' || state === 'cancelled';
    if (state !== 'pending' && state !== 'awaiting_auth' && !isRetry) {
      throw new BadRequestException(
        `La transferencia ya está en estado "${state}"; no se puede aportar el ` +
          `código de autorización ahora.`,
      );
    }

    // Reintento (A2.5): se limpia `provider_reference` (la orden anterior está
    // cerrada en el registrar) y se reabre la FSM a `pending` → `initiateTransferIn`
    // arranca un transfer FRESCO con el nuevo auth-code. No re-cobra (no se cobró
    // nada, ADR-084 A2.3/A2.5).
    if (isRetry) {
      await this.prisma.service.update({
        where: { id: serviceId },
        data: {
          provider_reference: null,
          metadata: {
            ...meta,
            domain_operation: 'transfer_in',
            transfer_state: 'pending',
          } as Prisma.InputJsonValue,
        },
      });
    }

    try {
      await this.orchestrator.initiateTransferIn(serviceId, authCode.trim());
    } catch (err) {
      if (err instanceof ProvisionerPluginError) {
        if (err.code === 'INVALID_AUTH_CODE') {
          throw new BadRequestException({
            code: 'INVALID_AUTH_CODE',
            message:
              'El código de autorización (EPP) no es válido. Revísalo en tu ' +
              'registrador actual y vuelve a intentarlo.',
          });
        }
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }

    // Releer el estado tras la iniciación (submitted en el camino feliz).
    const after = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { status: true, metadata: true },
    });
    const afterMeta =
      after?.metadata &&
      typeof after.metadata === 'object' &&
      !Array.isArray(after.metadata)
        ? (after.metadata as Record<string, unknown>)
        : {};
    return {
      id: serviceId,
      status: after?.status ?? service.status,
      transfer_state:
        typeof afterMeta.transfer_state === 'string'
          ? afterMeta.transfer_state
          : 'submitted',
    };
  }
}

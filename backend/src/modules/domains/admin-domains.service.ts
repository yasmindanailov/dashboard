import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DomainPriceOperation, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import {
  DomainPricingSyncRegistryService,
  DomainPricingSyncSummary,
} from '../../core/provisioning/domain-pricing-sync-registry.service';
import { ServiceWithRelations } from '../../core/provisioning/types';
import { AuditService } from '../audit/audit.service';
import { DeprovisionReasonDto } from '../provisioning/dto/provisioning.dto';
import { ProvisioningService } from '../provisioning/provisioning.service';

/** Moneda de venta v1 (ADR-084 A1.2 — moneda única). Misma que checkout/domains. */
const DEFAULT_DOMAIN_CURRENCY = 'EUR';

/** Una fila de la matriz de precios de dominios (vista admin). */
export interface DomainPricingRow {
  id: string;
  registrar_slug: string;
  tld: string;
  operation: DomainPriceOperation;
  years: number;
  cost_amount: string;
  cost_currency: string;
  price_amount: string;
  price_currency: string;
  /** Margen efectivo % (precio/coste−1), calculado para la UI; null si coste 0. */
  effective_margin_pct: string | null;
  /** % de markup configurado (null en overrides manuales). */
  markup_percent: string | null;
  source: 'sync' | 'manual';
  active: boolean;
  synced_at: string | null;
  updated_at: string;
}

/**
 * Sprint 15D Fase 15D.G·1 — gestión admin de precios de dominios.
 *
 * Cierra el hueco "producto dominio incompleto": el precio de un dominio vive en
 * `domain_tld_pricing` (por TLD×operación×años), poblado por el cron de pricing
 * del registrar. Aquí el admin:
 *   - **ve** la matriz completa (coste·markup·precio·fuente·sincronizado),
 *   - **fuerza** una sincronización ahora (cron manual, capability-routed R4 vía
 *     `DomainPricingSyncRegistryService` — NUNCA por slug),
 *   - **fija** un override manual del precio de venta de una fila (`source='manual'`,
 *     que el cron de sync NUNCA sobreescribe — ADR-084 §1) o lo revierte a automático.
 *
 * Guard de margen (DOM-INV-3, ADR-084 A1): un override manual no puede dejar el
 * precio por debajo del coste mayorista (se perdería dinero en cada venta).
 */
@Injectable()
export class AdminDomainsService {
  private readonly logger = new Logger(AdminDomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
    private readonly pricingSync: DomainPricingSyncRegistryService,
    private readonly provisioning: ProvisioningService,
    // 15D.II.R — restore: emite `domain.restored` (Outbox → billing factura el fee +
    // notif), audita (R3) e invalida la cache de getServiceInfo tras recuperar.
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly cache: ProvisioningCacheService,
  ) {}

  /**
   * Borrado admin de un dominio en período de gracia (ADR-081 A3.1, 15D.G·2).
   * **Destructivo + irreversible.** Borra el dominio en el registrar (con
   * reembolso si está en gracia) y luego cancela el `service` Aelium por el
   * lifecycle canónico (`deprovisionAsAdmin` — audit + evento `service.cancelled`).
   * El registrar se resuelve por capability (R4). Si el registrar rechaza el
   * borrado (fuera de gracia), NO se cancela el servicio (el dominio sigue vivo).
   */
  async deleteDomain(
    serviceId: string,
    reason: string,
    actor: { userId: string; ipAddress: string; userAgent?: string | null },
  ): Promise<{ id: string; status: string }> {
    const row = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            provisioner: true,
            provisioner_config: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (String(row.product.type) !== 'domain') {
      throw new BadRequestException('El servicio no es un dominio.');
    }
    if (!row.provider_reference) {
      throw new BadRequestException(
        'El dominio no está registrado (sin provider_reference) — nada que borrar.',
      );
    }

    const plugin = this.registry.get(
      row.provisioner_slug ?? row.product.provisioner,
    );
    if (
      !plugin ||
      !plugin.capabilities.is_domain_registrar ||
      typeof plugin.deleteDomain !== 'function'
    ) {
      throw new ServiceUnavailableException({
        code: 'DELETE_UNSUPPORTED',
        message: 'El registrar no soporta el borrado de dominios.',
      });
    }

    // 1. Borrado en el registrar (HTTP, fuera de tx). Si falla → no se cancela.
    await plugin.deleteDomain(this.toServiceWithRelations(row));

    // 2. Cancelación canónica del servicio Aelium (audit + service.cancelled).
    const result = await this.provisioning.deprovisionAsAdmin(
      serviceId,
      { reason: DeprovisionReasonDto.admin_override, notes: reason },
      actor.userId,
      { ipAddress: actor.ipAddress, userAgent: actor.userAgent ?? null },
    );
    this.logger.warn(
      `deleteDomain service=${serviceId}: dominio ${row.domain ?? '?'} borrado ` +
        `del registrar + servicio cancelado (actor=${actor.userId}).`,
    );
    return { id: result.id, status: result.status };
  }

  /**
   * Restore RGP admin (15D.II.R, ADR-081 A7.2). Recupera un dominio en redención
   * con la tarifa especial del registrar. **Admin/soporte** (el fee se cobra de
   * forma inmediata e irreversible al registrar — Yasmin 2026-06-24). El registrar
   * se resuelve por capability (R4). Flujo:
   *   1. Resuelve el fee de restore **antes** de restaurar (server-side R5, op
   *      `restore`; bloquea si no está tarifado o el margen es inválido DOM-INV-3 —
   *      no se restaura algo que no sabemos cobrar).
   *   2. `plugin.restoreDomain` (HTTP). Si falla → no se factura ni se emite nada.
   *   3. Emite `domain.restored` (Outbox) → el listener de billing genera la factura
   *      del fee + notifs; audita el cambio (R3); invalida la cache de getServiceInfo.
   */
  async restoreDomain(
    serviceId: string,
    reason: string,
    actor: { userId: string; ipAddress: string; userAgent?: string | null },
  ): Promise<{
    id: string;
    status: string;
    fee: { amount: string; currency: string };
  }> {
    const row = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            provisioner: true,
            provisioner_config: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (String(row.product.type) !== 'domain') {
      throw new BadRequestException('El servicio no es un dominio.');
    }
    if (!row.provider_reference || !row.domain) {
      throw new BadRequestException(
        'El dominio no está registrado (sin provider_reference/FQDN) — nada que restaurar.',
      );
    }

    // 1. Fee de restore server-side (R5) ANTES de restaurar (op `restore`, 1 año).
    const fqdn = row.domain.trim().toLowerCase();
    const tld = fqdn.split('.').slice(1).join('.');
    const pricing = await this.prisma.domainTldPricing.findUnique({
      where: {
        registrar_slug_tld_operation_years_price_currency: {
          registrar_slug: row.product.provisioner,
          tld,
          operation: 'restore',
          years: 1,
          price_currency: DEFAULT_DOMAIN_CURRENCY,
        },
      },
    });
    if (!pricing || !pricing.active) {
      throw new ServiceUnavailableException({
        code: 'RESTORE_NOT_PRICED',
        message: `No hay tarifa de restore configurada para .${tld}.`,
      });
    }
    // DOM-INV-3 same-currency: no restaurar a pérdida (el fee de RGP es alto).
    if (
      pricing.cost_currency !== pricing.price_currency ||
      Number(pricing.cost_amount) > Number(pricing.price_amount)
    ) {
      throw new BadRequestException({
        code: 'RESTORE_MARGIN_INVALID',
        message:
          'La tarifa de restore es incoherente (margen). Operación bloqueada.',
      });
    }

    const plugin = this.registry.get(
      row.provisioner_slug ?? row.product.provisioner,
    );
    if (
      !plugin ||
      !plugin.capabilities.is_domain_registrar ||
      typeof plugin.restoreDomain !== 'function'
    ) {
      throw new ServiceUnavailableException({
        code: 'RESTORE_UNSUPPORTED',
        message: 'El registrar no soporta el restore de dominios.',
      });
    }

    // 2. Restore en el registrar (HTTP, fuera de tx). Si falla → no se factura.
    await plugin.restoreDomain(this.toServiceWithRelations(row));

    // 3. Cobro + notif (vía evento, R4) + audit (R3) + invalidación de cache.
    const correlationId = randomUUID();
    const amount = Number(pricing.price_amount);
    const currency = pricing.price_currency;
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, 'domain.restored', {
        service_id: serviceId,
        user_id: row.user_id,
        fqdn,
        amount,
        currency,
        correlation_id: correlationId,
      });
    });
    await this.audit.logChange({
      user_id: actor.userId,
      entity_type: 'Service',
      entity_id: serviceId,
      action: 'domain.restored',
      changes_after: {
        fqdn,
        fee: `${amount.toFixed(2)} ${currency}`,
        reason,
      },
      correlation_id: correlationId,
    });
    await this.cache.invalidate(serviceId);

    this.logger.warn(
      `restoreDomain service=${serviceId}: ${fqdn} RESTAURADO desde redención ` +
        `(fee ${amount.toFixed(2)} ${currency}, actor=${actor.userId}).`,
    );
    return {
      id: serviceId,
      status: String(row.status),
      fee: { amount: amount.toFixed(2), currency },
    };
  }

  /** Construye un `ServiceWithRelations` mínimo (el plugin.deleteDomain solo lee id/ref/domain). */
  private toServiceWithRelations(row: {
    [k: string]: unknown;
    user_id: string;
    product: {
      id: string;
      slug: string;
      name: string;
      type: unknown;
      provisioner: string;
      provisioner_config: unknown;
    };
  }): ServiceWithRelations {
    return {
      ...row,
      client: {
        id: row.user_id,
        email: '',
        first_name: null,
        last_name: null,
        company_name: null,
        phone: null,
        locale: null,
        country_code: null,
      },
      product: {
        id: row.product.id,
        slug: row.product.slug,
        name: row.product.name,
        type: String(row.product.type),
        provisioner: row.product.provisioner,
        provisioner_config:
          (row.product.provisioner_config as Record<string, unknown> | null) ??
          null,
      },
    } as ServiceWithRelations;
  }

  /** Matriz de precios (opcionalmente filtrada por registrar/TLD/operación). */
  async listPricing(query: {
    registrar?: string;
    tld?: string;
    operation?: DomainPriceOperation;
  }): Promise<DomainPricingRow[]> {
    const where: Prisma.DomainTldPricingWhereInput = {
      ...(query.registrar ? { registrar_slug: query.registrar } : {}),
      ...(query.tld
        ? { tld: query.tld.trim().toLowerCase().replace(/^\./, '') }
        : {}),
      ...(query.operation ? { operation: query.operation } : {}),
    };
    const rows = await this.prisma.domainTldPricing.findMany({
      where,
      orderBy: [
        { registrar_slug: 'asc' },
        { tld: 'asc' },
        { operation: 'asc' },
        { years: 'asc' },
      ],
    });
    return rows.map((r) => this.toRow(r));
  }

  /**
   * Fuerza una sincronización de precios ahora (botón admin). Resuelve el
   * registrar por capability (`is_domain_registrar`, R4) y delega en su executor
   * registrado. Útil tras configurar el plugin o cambiar el markup, sin esperar
   * al cron diario.
   */
  async syncNow(): Promise<DomainPricingSyncSummary> {
    const plugin = this.registry.getByCapability('is_domain_registrar');
    if (!plugin) {
      throw new ServiceUnavailableException({
        code: 'NO_DOMAIN_REGISTRAR',
        message: 'No hay un registrar de dominios instalado.',
      });
    }
    if (!this.pricingSync.hasExecutor(plugin.slug)) {
      throw new ServiceUnavailableException({
        code: 'PRICING_SYNC_UNAVAILABLE',
        message: `El registrar "${plugin.slug}" no expone sincronización de precios.`,
      });
    }
    const summary = await this.pricingSync.runFor(plugin.slug);
    this.logger.log(
      `syncNow(${plugin.slug}): written=${summary.written} ` +
        `skipped_manual=${summary.skippedManual} skipped_currency=${summary.skippedCurrency}`,
    );
    return summary;
  }

  /**
   * Override manual del precio de venta de una fila. La fila debe existir (se
   * sincroniza primero; el override aplica sobre un TLD ya tarifado). El precio
   * no puede ser menor que el coste mayorista (DOM-INV-3).
   */
  async setManualPrice(id: string, price: number): Promise<DomainPricingRow> {
    const row = await this.prisma.domainTldPricing.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Fila de precio no encontrada.');
    }
    const cost = Number(row.cost_amount);
    if (Number.isFinite(cost) && price < cost) {
      throw new BadRequestException({
        code: 'PRICE_BELOW_COST',
        message: `El precio (${price.toFixed(2)}) no puede ser inferior al coste mayorista (${cost.toFixed(2)} ${row.cost_currency}).`,
      });
    }
    const updated = await this.prisma.domainTldPricing.update({
      where: { id },
      data: {
        price_amount: new Prisma.Decimal(price),
        source: 'manual',
        markup_percent: null, // override manual: el % de markup deja de aplicar
        active: true,
      },
    });
    this.logger.log(
      `setManualPrice ${row.registrar_slug}/.${row.tld}/${row.operation}/${row.years}a ` +
        `→ ${price.toFixed(2)} ${row.price_currency} (manual).`,
    );
    return this.toRow(updated);
  }

  /**
   * Revierte una fila a precio automático: `source='sync'`. El precio actual se
   * conserva hasta que el cron lo recalcule (en la próxima pasada o vía syncNow).
   */
  async revertToAuto(id: string): Promise<DomainPricingRow> {
    const row = await this.prisma.domainTldPricing.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Fila de precio no encontrada.');
    }
    const updated = await this.prisma.domainTldPricing.update({
      where: { id },
      data: { source: 'sync' },
    });
    return this.toRow(updated);
  }

  /** Mapea una fila Prisma a la shape de la API (decimales → strings). */
  private toRow(r: {
    id: string;
    registrar_slug: string;
    tld: string;
    operation: DomainPriceOperation;
    years: number;
    cost_amount: Prisma.Decimal;
    cost_currency: string;
    price_amount: Prisma.Decimal;
    price_currency: string;
    markup_percent: Prisma.Decimal | null;
    source: string;
    active: boolean;
    synced_at: Date | null;
    updated_at: Date;
  }): DomainPricingRow {
    const cost = Number(r.cost_amount);
    const price = Number(r.price_amount);
    const margin =
      Number.isFinite(cost) && cost > 0
        ? (((price - cost) / cost) * 100).toFixed(2)
        : null;
    return {
      id: r.id,
      registrar_slug: r.registrar_slug,
      tld: r.tld,
      operation: r.operation,
      years: r.years,
      cost_amount: r.cost_amount.toFixed(2),
      cost_currency: r.cost_currency,
      price_amount: r.price_amount.toFixed(2),
      price_currency: r.price_currency,
      effective_margin_pct: margin,
      markup_percent: r.markup_percent?.toFixed(2) ?? null,
      source: r.source === 'manual' ? 'manual' : 'sync',
      active: r.active,
      synced_at: r.synced_at?.toISOString() ?? null,
      updated_at: r.updated_at.toISOString(),
    };
  }
}

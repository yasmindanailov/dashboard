import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BillingCheckoutService } from '../billing/billing-checkout.service';
import { SubscriptionPlanChangeService } from '../billing/subscription-plan-change.service';
import { PresenceService } from '../presence/presence.service';
import {
  nextMaintenanceDate,
  computeMaintenanceStatus,
  sameUtcMonth,
  type MaintenanceTaskStatus,
  type SlotMaintenanceStatus,
} from './maintenance.helper';

/**
 * SupportInsideService — Sprint 8 Fase D (2026-05-01).
 *
 * Orquestador del lifecycle Support Inside (ADR-034 + ADR-061 + ADR-075).
 *
 * Reusa el motor de billing canónico (ADR-061 §"reutiliza checkout"):
 *   - subscribe() llama a BillingCheckoutService.checkout() para crear
 *     Service + Invoice asociados al producto type=support_inside. Después
 *     crea SupportInsideSubscription que apunta al service_id resultante.
 *   - cancel() libera slots + cancela el Service estándar (BillingService
 *     se encarga del lifecycle de facturación) + marca subscription como
 *     cancelled.
 *   - upgrade() cambia de plan (cross-tier) reusando el prorrateo ADR-029
 *     (Amendment A1, GL-23): crédito sin devolución + guard de slots.
 *
 * Reglas canónicas:
 *   - 1 cliente máx 1 subscription activa (ADR-034 + UNIQUE BD client_id).
 *     UNIQUE garantiza la invariante; validación previa devuelve 409 con
 *     mensaje claro en lugar de error genérico de Prisma.
 *   - 1 servicio máx 1 slot activo (released_at IS NULL). Validado aquí
 *     porque Postgres no permite UNIQUE parcial WHERE en Prisma.
 *   - Cancelar subscription libera slots en cascada (ADR-034 §"si se
 *     cancela Support Inside → se cancelan todos los slots automáticamente").
 *
 * Cumple R1 (events bus para audit/notifications futuras), R5 (cálculos
 * en backend), R7 (errores con mensaje accionable).
 */
@Injectable()
export class SupportInsideService {
  private readonly logger = new Logger(SupportInsideService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly checkout: BillingCheckoutService,
    private readonly planChange: SubscriptionPlanChangeService,
    private readonly presence: PresenceService,
  ) {}

  // ─── Subscribe ───────────────────────────────────────────────

  /**
   * Suscribe al cliente al plan elegido. Crea Service + Invoice via
   * BillingCheckoutService y genera la SupportInsideSubscription.
   *
   * @throws ConflictException si el cliente ya tiene subscription activa.
   * @throws BadRequestException si el pricing no corresponde a un producto
   *         type=support_inside (defense in depth — el listado público de
   *         catálogo ya excluye Support Inside, pero validamos aquí).
   */
  async subscribe(
    userId: string,
    dto: { product_pricing_id: string; billing_profile_id?: string },
  ) {
    // 1. Defense in depth: cliente sin subscription activa.
    const existing = await this.prisma.supportInsideSubscription.findUnique({
      where: { client_id: userId },
      select: { id: true, status: true },
    });
    if (existing && existing.status === 'active') {
      throw new ConflictException(
        'Ya tienes una suscripción Support Inside activa. Usa "Mejorar plan" o cancela primero.',
      );
    }

    // 2. Validar que el pricing es de un producto Support Inside.
    const pricing = await this.prisma.productPricing.findUnique({
      where: { id: dto.product_pricing_id },
      include: { product: true },
    });
    if (!pricing) {
      throw new NotFoundException('Plan de precios no encontrado.');
    }
    if (pricing.product.type !== 'support_inside') {
      throw new BadRequestException(
        'Este pricing no corresponde a un producto Support Inside.',
      );
    }

    // 3. Checkout reutiliza la maquinaria estándar (ADR-061).
    const checkoutResult = await this.checkout.checkout(userId, {
      product_pricing_id: dto.product_pricing_id,
      billing_profile_id: dto.billing_profile_id,
      label: `Support Inside — ${pricing.product.name}`,
    });

    // 4. Crear o reactivar subscription. Si existe pero cancelada,
    //    actualizamos en lugar de crear (UNIQUE client_id lo exige).
    const subscription = existing
      ? await this.prisma.supportInsideSubscription.update({
          where: { client_id: userId },
          data: {
            product_id: pricing.product_id,
            service_id: checkoutResult.service.id,
            status: 'active',
            started_at: new Date(),
            cancelled_at: null,
            cancellation_reason: null,
          },
        })
      : await this.prisma.supportInsideSubscription.create({
          data: {
            client_id: userId,
            product_id: pricing.product_id,
            service_id: checkoutResult.service.id,
            status: 'active',
          },
        });

    this.events.emit('support_inside.subscribed', {
      subscription_id: subscription.id,
      client_id: userId,
      product_id: pricing.product_id,
      service_id: checkoutResult.service.id,
    });

    this.logger.log(
      `Support Inside subscribed: client=${userId} plan=${pricing.product.slug} subscription=${subscription.id}`,
    );

    return {
      subscription,
      service: checkoutResult.service,
      invoice: checkoutResult.invoice,
    };
  }

  // ─── Cambio de plan (GL-23 / ADR-029 A1) ──────────────────────

  /**
   * Preview del prorrateo de un cambio de plan Support Inside (R5: el cliente lo
   * ve ANTES de confirmar). Valida el plan destino + el guard de slots.
   */
  async previewUpgrade(
    userId: string,
    dto: { new_product_pricing_id: string },
  ) {
    const ctx = await this.loadPlanChangeContext(
      userId,
      dto.new_product_pricing_id,
    );
    this.assertSlotsFit(ctx);
    return this.planChange.previewPlanChange(
      ctx.serviceId,
      dto.new_product_pricing_id,
      userId,
      false,
      { allowCrossProduct: true },
    );
  }

  /**
   * Cambia el plan de la subscription activa (upgrade/downgrade cross-tier).
   * Reusa el motor de prorrateo ADR-029 (A1, GL-23): crédito sin devolución +
   * factura del prorrateo idempotente. Actualiza la subscription al nuevo
   * producto **dentro de la misma transacción** (txHook) que el cambio del
   * service. Guard de slots: no se puede bajar a un plan con menos slots
   * incluidos que los ya asignados (el cliente libera primero).
   */
  async upgrade(userId: string, dto: { new_product_pricing_id: string }) {
    const ctx = await this.loadPlanChangeContext(
      userId,
      dto.new_product_pricing_id,
    );
    this.assertSlotsFit(ctx);

    const result = await this.planChange.confirmPlanChange(
      ctx.serviceId,
      dto.new_product_pricing_id,
      userId,
      false,
      {
        allowCrossProduct: true,
        txHook: async (tx) => {
          await tx.supportInsideSubscription.update({
            where: { service_id: ctx.serviceId },
            data: { product_id: ctx.newProductId },
          });
        },
      },
    );

    this.events.emit('support_inside.plan_changed', {
      subscription_id: ctx.subscriptionId,
      client_id: userId,
      from_product_id: ctx.currentProductId,
      to_product_id: ctx.newProductId,
      service_id: ctx.serviceId,
    });

    this.logger.log(
      `Support Inside plan changed: client=${userId} ` +
        `${ctx.currentProductId}→${ctx.newProductId} service=${ctx.serviceId} ` +
        `amount_to_pay=${result.proration.amount_to_pay}`,
    );

    return { ok: true, proration: result.proration };
  }

  /* ── helpers cambio de plan (ADR-029 A1) ── */

  /**
   * Carga + valida el contexto del cambio de plan: subscription activa del
   * cliente + plan SI destino. El resto de invariantes (servicio activo,
   * ownership, no-op mismo-plan, prorrateo) las aplica `SubscriptionPlanChangeService`.
   */
  private async loadPlanChangeContext(userId: string, newPricingId: string) {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { client_id: userId },
        include: {
          slots: {
            where: { released_at: null },
            select: { id: true, is_extra: true },
          },
        },
      },
    );
    if (!subscription || subscription.status !== 'active') {
      throw new ConflictException(
        'No tienes una suscripción Support Inside activa que cambiar.',
      );
    }

    const newPricing = await this.prisma.productPricing.findUnique({
      where: { id: newPricingId },
      include: { product: { include: { support_inside_config: true } } },
    });
    if (!newPricing) {
      throw new NotFoundException('Plan de precios no encontrado.');
    }
    if (
      newPricing.product.type !== 'support_inside' ||
      !newPricing.product.support_inside_config
    ) {
      throw new BadRequestException(
        'El plan destino no es un plan Support Inside válido.',
      );
    }

    return {
      subscriptionId: subscription.id,
      serviceId: subscription.service_id,
      currentProductId: subscription.product_id,
      newProductId: newPricing.product_id,
      newSlotsIncluded: newPricing.product.support_inside_config.slots_included,
      activeIncludedSlots: subscription.slots.filter((sl) => !sl.is_extra)
        .length,
    };
  }

  /** Guard de downgrade: no dejar slots incluidos huérfanos (cliente libera primero). */
  private assertSlotsFit(ctx: {
    newSlotsIncluded: number;
    activeIncludedSlots: number;
  }): void {
    if (ctx.newSlotsIncluded < ctx.activeIncludedSlots) {
      const toRelease = ctx.activeIncludedSlots - ctx.newSlotsIncluded;
      throw new BadRequestException(
        `El plan destino incluye ${ctx.newSlotsIncluded} slot(s) y tienes ` +
          `${ctx.activeIncludedSlots} asignado(s). Libera ${toRelease} antes de cambiar a ese plan.`,
      );
    }
  }

  // ─── Cancel ──────────────────────────────────────────────────

  /**
   * Cancela la subscription. Libera slots en cascada (ADR-034 §"si se
   * cancela Support Inside → se cancelan todos los slots automáticamente").
   * El Service estándar se marca como cancelled (BillingService cron lo
   * recoge para parar facturación recurrente).
   *
   * Nota: los servicios técnicos del cliente (hosting, dominio, etc.) NO
   * se tocan — sólo se libera el slot que los cubría con mantenimiento
   * Support Inside. El cliente sigue teniendo sus servicios activos.
   */
  async cancel(userId: string, dto: { reason?: string }) {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { client_id: userId },
        include: { slots: { where: { released_at: null } } },
      },
    );
    if (!subscription || subscription.status !== 'active') {
      throw new NotFoundException(
        'No tienes una suscripción Support Inside activa.',
      );
    }

    const now = new Date();
    const releasedSlotIds = subscription.slots.map((s) => s.id);

    await this.prisma.$transaction(async (tx) => {
      // 1. Liberar todos los slots activos.
      if (releasedSlotIds.length > 0) {
        await tx.supportInsideSlot.updateMany({
          where: { id: { in: releasedSlotIds } },
          data: { released_at: now },
        });
      }
      // 2. Marcar subscription como cancelled.
      await tx.supportInsideSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: dto.reason ?? null,
        },
      });
      // 3. Cancelar el Service estándar (BillingService cron lo recoge).
      await tx.service.update({
        where: { id: subscription.service_id },
        data: {
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: dto.reason ?? 'Cancelación Support Inside',
        },
      });
    });

    // Emit eventos por slot liberado para listeners de audit / notifications.
    for (const slotId of releasedSlotIds) {
      this.events.emit('support_inside.slot_released', {
        slot_id: slotId,
        subscription_id: subscription.id,
        client_id: userId,
        reason: 'subscription_cancelled',
      });
    }
    this.events.emit('support_inside.cancelled', {
      subscription_id: subscription.id,
      client_id: userId,
      reason: dto.reason ?? null,
      released_slots: releasedSlotIds.length,
    });

    this.logger.log(
      `Support Inside cancelled: client=${userId} subscription=${subscription.id} released_slots=${releasedSlotIds.length}`,
    );

    return {
      cancelled: true,
      released_slots: releasedSlotIds.length,
    };
  }

  // ─── Add slot ────────────────────────────────────────────────

  /**
   * Asigna un slot Support Inside a un servicio del cliente.
   *
   * Validaciones (en orden):
   *   1. Subscription activa del cliente.
   *   2. Servicio pertenece al cliente y está activo.
   *   3. Servicio no tiene slot activo ya (released_at IS NULL).
   *   4. Tipo de slot está en config.slot_types_allowed.
   *   5. Si NO is_extra: cliente no ha agotado slots_included.
   *   6. Si is_extra: futura validación de pricing del extra (Sprint
   *      dedicado — Sprint 8 MVP no factura extras automáticamente).
   */
  async addSlot(
    userId: string,
    dto: {
      service_id: string;
      slot_type: 'maintenance' | 'maintenance_management';
      is_extra?: boolean;
    },
  ) {
    const subscription = await this.getActiveSubscriptionWithConfig(userId);

    // 2. Service pertenece al cliente y está activo.
    const service = await this.prisma.service.findUnique({
      where: { id: dto.service_id },
      select: {
        id: true,
        user_id: true,
        status: true,
        product: { select: { type: true } },
      },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (service.user_id !== userId) {
      throw new ForbiddenException(
        'Este servicio no pertenece al cliente actual.',
      );
    }
    if (service.status !== 'active') {
      throw new BadRequestException(
        'Sólo puedes asignar slots a servicios activos.',
      );
    }
    // Sub-fase 8.D.12 fix bug 2026-05-01: el plan SI vive en `services`
    // como vehículo del cobro recurrente del propio plan, NO como un
    // recurso técnico mantenible. Asignarle un slot a sí mismo es
    // semánticamente absurdo (el cliente cobraría mantenimiento de su
    // propio mantenimiento). Defense in depth: el endpoint
    // `eligible-services` ya los filtra, pero `addSlot()` recibe
    // `service_id` directo y debe rechazarlo aquí también.
    if (service.product.type === 'support_inside') {
      throw new BadRequestException(
        'No puedes asignar un slot al propio plan Support Inside. Elige uno de tus servicios técnicos (hosting, dominio, etc.).',
      );
    }
    // Sub-fase 8.D.12 (2026-05-01): cada plan SI declara qué tipos de
    // producto admite mantenimiento. Empty array = sin restricciones
    // (legacy / "Enterprise" futuro). Si el array tiene entradas y el
    // tipo del servicio NO está, rechazo con mensaje accionable. El
    // editor admin lo configura por plan; el cliente ve solo los
    // servicios elegibles en el dropdown (filtrado en `eligible-services`).
    const applicable = subscription.config.applicable_product_types;
    if (applicable.length > 0 && !applicable.includes(service.product.type)) {
      throw new BadRequestException(
        `Tu plan ${subscription.product.name} no admite mantenimiento para servicios de tipo "${service.product.type}". Tipos permitidos: ${applicable.join(', ')}.`,
      );
    }

    // 3. Servicio sin slot activo (UNIQUE parcial via app, ADR-075 §A.2).
    const activeSlot = await this.prisma.supportInsideSlot.findFirst({
      where: { service_id: dto.service_id, released_at: null },
      select: { id: true },
    });
    if (activeSlot) {
      throw new ConflictException(
        'Este servicio ya tiene un slot Support Inside activo. Libéralo antes de asignar otro.',
      );
    }

    // 4. Tipo permitido por el plan.
    if (!subscription.config.slot_types_allowed.includes(dto.slot_type)) {
      throw new BadRequestException(
        `Tu plan no admite slots de tipo "${dto.slot_type}". Tipos disponibles: ${subscription.config.slot_types_allowed.join(', ')}.`,
      );
    }

    // 5. Cuota incluida vs extra.
    const isExtra = dto.is_extra ?? false;
    if (!isExtra) {
      const activeIncluded = await this.prisma.supportInsideSlot.count({
        where: {
          subscription_id: subscription.id,
          released_at: null,
          is_extra: false,
        },
      });
      if (activeIncluded >= subscription.config.slots_included) {
        throw new BadRequestException(
          `Tu plan permite ${subscription.config.slots_included} slot(s) incluidos. Sube de plan o usa is_extra=true (facturación de extras pendiente Sprint dedicado).`,
        );
      }
    }

    // ADR-034 §recurrencia + sub-fase 8.D.12.1: distribuir carga del cron
    // a lo largo del mes. anniversary_day = día efectivo de hoy capado a 28
    // para evitar problemas con febrero. CHECK constraint en BD lo refuerza.
    const today = new Date();
    const anniversaryDay = Math.min(today.getUTCDate(), 28);

    const slot = await this.prisma.supportInsideSlot.create({
      data: {
        subscription_id: subscription.id,
        service_id: dto.service_id,
        slot_type: dto.slot_type,
        is_extra: isExtra,
        anniversary_day: anniversaryDay,
      },
    });

    this.events.emit('support_inside.slot_assigned', {
      slot_id: slot.id,
      subscription_id: subscription.id,
      client_id: userId,
      service_id: dto.service_id,
      slot_type: dto.slot_type,
      is_extra: isExtra,
    });

    this.logger.log(
      `Slot assigned: client=${userId} service=${dto.service_id} type=${dto.slot_type} extra=${isExtra}`,
    );

    return slot;
  }

  // ─── Release slot ────────────────────────────────────────────

  async releaseSlot(userId: string, slotId: string) {
    const slot = await this.prisma.supportInsideSlot.findUnique({
      where: { id: slotId },
      include: {
        subscription: { select: { client_id: true } },
      },
    });
    if (!slot) {
      throw new NotFoundException('Slot no encontrado.');
    }
    if (slot.subscription.client_id !== userId) {
      throw new ForbiddenException('Este slot no pertenece al cliente actual.');
    }
    if (slot.released_at) {
      throw new BadRequestException('Este slot ya está liberado.');
    }

    await this.prisma.supportInsideSlot.update({
      where: { id: slotId },
      data: { released_at: new Date() },
    });

    this.events.emit('support_inside.slot_released', {
      slot_id: slotId,
      subscription_id: slot.subscription_id,
      client_id: userId,
      reason: 'manual',
    });

    this.logger.log(
      `Slot released: client=${userId} slot=${slotId} service=${slot.service_id}`,
    );

    return { released: true };
  }

  // ─── List public plans (catalog for client comparator) ──────────
  //
  // Sprint 8 Fase D frontend (8.D.5): el cliente necesita ver los 3
  // planes para decidir cuál contratar. El catálogo público de productos
  // (`/products`) no incluye `support_inside_config`, así que exponemos
  // un endpoint específico que devuelve los campos canónicos del
  // comparador (precio mensual + anual, slots, canales, SLA, tier de
  // prioridad). Coherente con ADR-075 §B.2 — el formato comparador es
  // del cliente, no del admin.
  //
  // El endpoint exige `Read.SupportInside` (cualquier `client` lo tiene),
  // así no se filtran datos de planes a roles que no deben verlos
  // (partner / partner_pending no tienen `Read.SupportInside`).

  async listPublicPlans() {
    const products = await this.prisma.product.findMany({
      where: { type: 'support_inside', status: 'active' },
      include: {
        support_inside_config: true,
        pricing: { where: { active: true }, orderBy: { billing_cycle: 'asc' } },
      },
      orderBy: { order_index: 'asc' },
    });

    return products.map((p) => {
      const monthly = p.pricing.find((pr) => pr.billing_cycle === 'monthly');
      const yearly = p.pricing.find((pr) => pr.billing_cycle === 'annual');
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        short_description: p.short_description,
        description: p.description,
        badge_text: p.badge_text,
        order_index: p.order_index,
        pricing: {
          monthly: monthly
            ? {
                product_pricing_id: monthly.id,
                price: monthly.price.toString(),
                currency: monthly.currency,
              }
            : null,
          yearly: yearly
            ? {
                product_pricing_id: yearly.id,
                price: yearly.price.toString(),
                currency: yearly.currency,
                discount_percentage:
                  yearly.discount_percentage?.toString() ?? null,
              }
            : null,
        },
        config: p.support_inside_config
          ? {
              slots_included: p.support_inside_config.slots_included,
              slot_types_allowed: p.support_inside_config.slot_types_allowed,
              applicable_product_types:
                p.support_inside_config.applicable_product_types,
              extra_slot_price:
                p.support_inside_config.extra_slot_price.toString(),
              channels_active: p.support_inside_config.channels_active,
              priority_tier: p.support_inside_config.priority_tier,
              response_sla_hours: p.support_inside_config.response_sla_hours,
            }
          : null,
      };
    });
  }

  // ─── List eligible services for slot assignment ─────────────
  //
  // Sub-fase 8.D.12.8: el modal de asignación de slot necesita el listado
  // de servicios `active` del cliente que NO tienen slot Support Inside
  // activo (ya cubierto). Endpoint scoped al dominio support-inside —
  // cuando llegue Sprint 11 Provisioning con `/dashboard/services` propio,
  // ese listado canónico podrá reusar el mismo backend filtrando con
  // `?eligible_for_support_inside=true`.

  async listEligibleServices(userId: string) {
    // Resolvemos primero la subscription activa para conocer
    // `applicable_product_types`. Si el cliente no tiene plan, devuelvo
    // listado vacío con mensaje descriptivo en frontend (no debería pasar
    // por CASL — `Update.SupportInside` exige plan, pero defense in depth).
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { client_id: userId },
        include: {
          product: { include: { support_inside_config: true } },
        },
      },
    );
    if (
      !subscription ||
      subscription.status !== 'active' ||
      !subscription.product.support_inside_config
    ) {
      return [];
    }
    const applicable =
      subscription.product.support_inside_config.applicable_product_types;

    // Construimos el filtro `product.type` combinando dos reglas:
    //   - Defensa: nunca el propio plan SI.
    //   - Si el plan declara `applicable_product_types`, intersecta con esa
    //     lista (también excluye `support_inside` por construcción ya que
    //     es un type que no estará en el array, pero el `not` defensivo
    //     queda igualmente para legacy / arrays vacíos).
    const productFilter: Prisma.ProductWhereInput =
      applicable.length > 0
        ? {
            // `in` ya es restrictivo. Filtramos `support_inside` aunque
            // no esté en la lista canónica — defense in depth.
            type: { in: applicable.filter((t) => t !== 'support_inside') },
          }
        : { type: { not: 'support_inside' } };

    const services = await this.prisma.service.findMany({
      where: {
        user_id: userId,
        status: 'active',
        // Solo servicios sin slot SI activo (released_at IS NULL).
        support_inside_slots: { none: { released_at: null } },
        product: productFilter,
      },
      select: {
        id: true,
        label: true,
        domain: true,
        status: true,
        product: { select: { name: true, type: true } },
      },
      orderBy: [{ created_at: 'asc' }],
    });

    return services.map((s) => ({
      id: s.id,
      label: s.label,
      domain: s.domain,
      status: s.status,
      product_name: s.product.name,
      product_type: s.product.type,
    }));
  }

  // ─── Get status ──────────────────────────────────────────────

  async getStatus(userId: string) {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { client_id: userId },
        include: {
          product: {
            include: { support_inside_config: true },
          },
          service: {
            select: { id: true, status: true, next_due_date: true },
          },
          // F3·E8 — "tu técnico" (cuidador estable). La presencia se añade
          // abajo (derivada del heartbeat) — no es columna de User.
          technician: {
            select: { id: true, first_name: true, last_name: true },
          },
          slots: {
            where: { released_at: null },
            include: {
              service: {
                select: {
                  id: true,
                  label: true,
                  domain: true,
                  status: true,
                  product: { select: { name: true } },
                },
              },
            },
            orderBy: { assigned_at: 'desc' },
          },
        },
      },
    );

    if (!subscription || subscription.status !== 'active') {
      return null;
    }

    // F3·E8 — enriquecemos la vista gestionada: técnico + presencia, y por
    // slot la última/próxima revisión + estado (todo DERIVADO, sin columnas).
    const now = new Date();
    const technician = subscription.technician
      ? {
          id: subscription.technician.id,
          first_name: subscription.technician.first_name,
          last_name: subscription.technician.last_name,
          presence: await this.presence.getPresence(
            subscription.technician.id,
            now,
          ),
        }
      : null;
    const slots = await this.enrichSlotsMaintenance(subscription.slots, now);

    // F3·E8 — sección "El valor que te aporta": total de mantenimientos,
    // tiempo medio real de 1ª respuesta del cliente, y los últimos
    // mantenimientos (timeline). Lecturas display-only (datos del cliente).
    const [maintenance_count, recentLogs, respondedConvos] = await Promise.all([
      this.prisma.maintenanceLog.count({ where: { client_id: userId } }),
      this.prisma.maintenanceLog.findMany({
        where: { client_id: userId },
        orderBy: { performed_at: 'desc' },
        take: 5,
        select: {
          id: true,
          month_year: true,
          client_facing_notes: true,
          performed_at: true,
          service: {
            select: {
              label: true,
              domain: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      // Lectura cross-módulo legítima (conversaciones del propio cliente,
      // solo para el agregado "tiempo medio de respuesta").
      this.prisma.conversation.findMany({
        where: { user_id: userId, first_response_at: { not: null } },
        select: { created_at: true, first_response_at: true },
      }),
    ]);

    let avg_first_response_minutes: number | null = null;
    if (respondedConvos.length > 0) {
      const totalMin = respondedConvos.reduce(
        (sum, c) =>
          sum +
          (c.first_response_at!.getTime() - c.created_at.getTime()) / 60000,
        0,
      );
      avg_first_response_minutes = Math.round(
        totalMin / respondedConvos.length,
      );
    }

    const recent_maintenances = recentLogs.map((log) => ({
      id: log.id,
      month_year: log.month_year,
      summary: log.client_facing_notes,
      performed_at: log.performed_at.toISOString(),
      service_name:
        log.service.label || log.service.domain || log.service.product.name,
    }));

    return {
      ...subscription,
      technician,
      slots,
      maintenance_count,
      avg_first_response_minutes,
      recent_maintenances,
    };
  }

  /**
   * F3·E8 — histórico de mantenimientos visible al cliente para un slot.
   * Devuelve los `MaintenanceLog` del servicio del slot (resumen público
   * `client_facing_notes` + fecha + técnico que lo hizo + los ítems de
   * checklist completados). Ownership: el slot debe ser del `userId`.
   */
  async getMaintenanceHistory(userId: string, slotId: string) {
    const slot = await this.prisma.supportInsideSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        service_id: true,
        subscription: { select: { client_id: true } },
        service: {
          select: {
            label: true,
            domain: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!slot || slot.subscription.client_id !== userId) {
      throw new NotFoundException('Slot Support Inside no encontrado.');
    }

    const logs = await this.prisma.maintenanceLog.findMany({
      where: { service_id: slot.service_id, client_id: userId },
      orderBy: { performed_at: 'desc' },
      select: {
        id: true,
        month_year: true,
        client_facing_notes: true,
        performed_at: true,
        performer: { select: { first_name: true, last_name: true } },
        task: {
          select: {
            checklist_completions: {
              select: { item_id: true, item_kind: true },
            },
          },
        },
      },
    });

    // Resolver los labels de los ítems de checklist (service vs product) en
    // batch — son los "tareas hechas" que el mockup lista por mantenimiento.
    const completions = logs.flatMap(
      (l) => l.task?.checklist_completions ?? [],
    );
    const serviceItemIds = [
      ...new Set(
        completions
          .filter((c) => c.item_kind === 'service')
          .map((c) => c.item_id),
      ),
    ];
    const productItemIds = [
      ...new Set(
        completions
          .filter((c) => c.item_kind === 'product')
          .map((c) => c.item_id),
      ),
    ];
    const [serviceItems, productItems] = await Promise.all([
      serviceItemIds.length
        ? this.prisma.serviceChecklistItem.findMany({
            where: { id: { in: serviceItemIds } },
            select: { id: true, label: true },
          })
        : Promise.resolve([]),
      productItemIds.length
        ? this.prisma.productChecklistItem.findMany({
            where: { id: { in: productItemIds } },
            select: { id: true, label: true },
          })
        : Promise.resolve([]),
    ]);
    const labelByKey = new Map<string, string>();
    for (const i of serviceItems) labelByKey.set(`service:${i.id}`, i.label);
    for (const i of productItems) labelByKey.set(`product:${i.id}`, i.label);

    return {
      service: {
        label: slot.service.label,
        domain: slot.service.domain,
        product_name: slot.service.product.name,
      },
      history: logs.map((log) => ({
        id: log.id,
        month_year: log.month_year,
        summary: log.client_facing_notes,
        performed_at: log.performed_at.toISOString(),
        performed_by: log.performer
          ? `${log.performer.first_name} ${log.performer.last_name}`
          : null,
        tasks_done: (log.task?.checklist_completions ?? [])
          .map((c) => labelByKey.get(`${c.item_kind}:${c.item_id}`))
          .filter((label): label is string => Boolean(label)),
      })),
    };
  }

  /**
   * F3·E8 — añade a cada slot `last_maintenance_at` (último `MaintenanceLog`
   * del servicio), `next_maintenance_at` y `maintenance_status` (derivados de
   * `anniversary_day` + la tarea del periodo). 3 queries acotadas (logs +
   * tareas), sin N+1.
   */
  private async enrichSlotsMaintenance<
    S extends { id: string; service_id: string; anniversary_day: number },
  >(
    slots: S[],
    now: Date,
  ): Promise<
    Array<
      S & {
        last_maintenance_at: string | null;
        next_maintenance_at: string;
        maintenance_status: SlotMaintenanceStatus;
      }
    >
  > {
    if (slots.length === 0) return [];
    const slotIds = slots.map((s) => s.id);
    const serviceIds = [...new Set(slots.map((s) => s.service_id))];

    const logs = await this.prisma.maintenanceLog.findMany({
      where: { service_id: { in: serviceIds } },
      orderBy: { performed_at: 'desc' },
      select: { service_id: true, performed_at: true },
    });
    const lastByService = new Map<string, Date>();
    for (const log of logs) {
      if (!lastByService.has(log.service_id)) {
        lastByService.set(log.service_id, log.performed_at);
      }
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        source_system: 'support_inside_slot',
        source_id: { in: slotIds },
      },
      orderBy: { created_at: 'desc' },
      select: { source_id: true, status: true, created_at: true },
    });
    const latestTaskBySlot = new Map<
      string,
      { status: MaintenanceTaskStatus; created_at: Date }
    >();
    for (const task of tasks) {
      if (!latestTaskBySlot.has(task.source_id)) {
        latestTaskBySlot.set(task.source_id, {
          status: task.status,
          created_at: task.created_at,
        });
      }
    }

    return slots.map((slot) => {
      const lastMaintenanceAt = lastByService.get(slot.service_id) ?? null;
      const latestTask = latestTaskBySlot.get(slot.id);
      // La tarea cuenta como "del periodo actual" solo si se creó este mes.
      const currentTaskStatus =
        latestTask && sameUtcMonth(latestTask.created_at, now)
          ? latestTask.status
          : null;
      return {
        ...slot,
        last_maintenance_at: lastMaintenanceAt
          ? lastMaintenanceAt.toISOString()
          : null,
        next_maintenance_at: nextMaintenanceDate(
          slot.anniversary_day,
          now,
          lastMaintenanceAt,
        ).toISOString(),
        maintenance_status: computeMaintenanceStatus({
          now,
          anniversaryDay: slot.anniversary_day,
          lastMaintenanceAt,
          currentTaskStatus,
        }),
      };
    });
  }

  // ─── Helpers internos ────────────────────────────────────────

  private async getActiveSubscriptionWithConfig(userId: string): Promise<
    Prisma.SupportInsideSubscriptionGetPayload<{
      include: {
        product: { include: { support_inside_config: true } };
      };
    }> & {
      config: NonNullable<
        Prisma.SupportInsideSubscriptionGetPayload<{
          include: {
            product: { include: { support_inside_config: true } };
          };
        }>['product']['support_inside_config']
      >;
    }
  > {
    const subscription = await this.prisma.supportInsideSubscription.findUnique(
      {
        where: { client_id: userId },
        include: {
          product: { include: { support_inside_config: true } },
        },
      },
    );
    if (!subscription || subscription.status !== 'active') {
      throw new NotFoundException(
        'No tienes una suscripción Support Inside activa.',
      );
    }
    if (!subscription.product.support_inside_config) {
      // Defensa: producto Support Inside sin config seedeada → datos
      // inconsistentes. Mensaje accionable para el admin.
      throw new BadRequestException(
        'El plan no tiene configuración Support Inside. Contacta soporte.',
      );
    }
    return Object.assign(subscription, {
      config: subscription.product.support_inside_config,
    });
  }
}

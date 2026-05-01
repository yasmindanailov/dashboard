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
 *   - upgrade() pendiente Sprint dedicado (ADR-029 prorrateo) — versión
 *     MVP rechaza con mensaje accionable.
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

  // ─── Upgrade (MVP — Sprint 8 Fase D) ──────────────────────────

  /**
   * Cambia el plan de la subscription activa. MVP Sprint 8 Fase D rechaza
   * con mensaje accionable — el flujo correcto exige prorrateo (ADR-029)
   * y se aborda en sprint dedicado.
   *
   * Workaround temporal: el cliente cancela el plan actual y contrata el
   * nuevo. La factura del plan nuevo lleva fecha del día. La del plan
   * anterior NO se reembolsa (decisión consciente — Aelium no devuelve
   * dinero por servicios consumidos parcialmente; se compensa con créditos
   * en futuros sprints).
   */
  upgrade(
    _userId: string,
    _dto: { new_product_pricing_id: string },
  ): Promise<never> {
    throw new BadRequestException(
      'Cambio de plan automático pendiente (ADR-029 prorrateo). Por ahora: cancela el plan actual y contrata el nuevo.',
    );
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
      select: { id: true, user_id: true, status: true },
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

    const slot = await this.prisma.supportInsideSlot.create({
      data: {
        subscription_id: subscription.id,
        service_id: dto.service_id,
        slot_type: dto.slot_type,
        is_extra: isExtra,
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

    return subscription;
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

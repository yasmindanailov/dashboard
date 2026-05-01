import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { UpdateSupportInsidePlanDto } from './dto/support-inside.dto';

/**
 * SupportInsidePlansAdminService — Sprint 8 Fase D + ADR-075.
 *
 * Capa admin del módulo Support Inside. Materializa el aislamiento del
 * CRUD genérico de productos (ADR-075 §A): este service llama directo a
 * Prisma para gestionar los planes Support Inside (que viven como
 * `products` con type=support_inside + `support_inside_config`), sin
 * pasar por `AdminProductsController` ni por su `ProductsService`.
 *
 * Por qué directo a Prisma y no via ProductsService:
 *   - ProductsService aplicaría las validaciones genéricas de productos
 *     (PROD-INV-2 type inmutable, PROD-INV-3 flags inmutables, etc.) que
 *     no aplican al editor dedicado: aquí editamos slots/canales/SLA, no
 *     el `type` ni los flags.
 *   - El editor del plan (ADR-075 §B.2) actualiza en una sola transacción
 *     campos de `products` + `support_inside_config` + `product_pricing`.
 *     Hacerlo via tres llamadas a otros services exigiría coordinación
 *     transaccional cross-service que rompe la atomicidad.
 *   - Defense in depth: si un día se cuela un cambio que rompe el guard
 *     del `AdminProductsController`, este service sigue funcionando porque
 *     no depende de él.
 *
 * NO se exponen `create()` ni `delete()` — los 3 planes son seedeados
 * (ADR-075 §A.2 + §B.2). Un cuarto plan exige migración + ADR específico.
 */
@Injectable()
export class SupportInsidePlansAdminService {
  private readonly logger = new Logger(SupportInsidePlansAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listado para el índice `/admin/support-inside-plans` (ADR-075 §B.2).
   * Devuelve los 3 planes con las columnas que el índice muestra: nombre,
   * pricing mensual + anual, slots, estado, última edición.
   */
  async list() {
    const products = await this.prisma.product.findMany({
      where: { type: 'support_inside' },
      include: {
        support_inside_config: true,
        pricing: { where: { active: true }, orderBy: { billing_cycle: 'asc' } },
      },
      orderBy: { order_index: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      short_description: p.short_description,
      status: p.status,
      slots_included: p.support_inside_config?.slots_included ?? 0,
      pricing_monthly:
        p.pricing.find((pr) => pr.billing_cycle === 'monthly')?.price ?? null,
      pricing_yearly:
        p.pricing.find((pr) => pr.billing_cycle === 'annual')?.price ?? null,
      currency: p.pricing[0]?.currency ?? 'EUR',
      updated_at: p.updated_at,
    }));
  }

  /**
   * Detalle full del plan para el editor `/admin/support-inside-plans/<slug>`.
   * Retorna producto + config + pricing al completo (todas las secciones
   * card del editor pueden popular sus campos desde aquí).
   */
  async findBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, type: 'support_inside' },
      include: {
        support_inside_config: true,
        pricing: { orderBy: { billing_cycle: 'asc' } },
      },
    });
    if (!product) {
      throw new NotFoundException(`Plan Support Inside "${slug}" no existe.`);
    }
    return product;
  }

  /**
   * Actualiza el plan completo en transacción atómica.
   *
   * Coreografía del editor (ADR-075 §B.2 — 5 secciones card):
   *   1. Identidad — `name`, `description`, `short_description`, `status`.
   *      `slug` y `type` NUNCA mutables (PROD-INV-2 reaplicada).
   *   2. Precios — `pricing[monthly]` y `pricing[yearly]` (upsert por
   *      product_id+billing_cycle+currency).
   *   3. Slots y capacidades — `slots_included`, `slot_types_allowed`,
   *      `extra_slot_price` en `support_inside_config`.
   *   4. Soporte y canales — `channels_active`, `priority_tier`,
   *      `response_sla_hours`.
   *   5. Configuración avanzada — `partner_commission_pct` (en `products`),
   *      `cta_visibility` en `support_inside_config`.
   *
   * Cualquier subset es válido (las secciones se guardan independientes
   * desde la UI). Campos no enviados quedan intactos.
   */
  async update(slug: string, dto: UpdateSupportInsidePlanDto) {
    const existing = await this.prisma.product.findFirst({
      where: { slug, type: 'support_inside' },
      include: { support_inside_config: true },
    });
    if (!existing) {
      throw new NotFoundException(`Plan Support Inside "${slug}" no existe.`);
    }

    const data = dto;

    // Defense in depth: el DTO ya excluye `type` / `slug` / flags (no
    // existen como campos), pero protegemos contra payloads externos
    // que se cuelen. ValidationPipe con `forbidNonWhitelisted` los
    // tumbaría antes de llegar aquí; este check es belt+suspenders.
    const raw = data as unknown as Record<string, unknown>;
    if ('type' in raw || 'slug' in raw) {
      throw new BadRequestException(
        'No se permite cambiar el slug ni el tipo del plan (PROD-INV-2).',
      );
    }
    if (
      'is_addon' in raw ||
      'is_global_addon' in raw ||
      'requires_existing_product' in raw
    ) {
      throw new BadRequestException(
        'Los flags de addon son inmutables (PROD-INV-3).',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1+5. Update producto (Identidad + comisión partner).
      const productPatch: Prisma.ProductUpdateInput = {};
      if (data.name !== undefined) productPatch.name = data.name;
      if (data.description !== undefined)
        productPatch.description = data.description;
      if (data.short_description !== undefined)
        productPatch.short_description = data.short_description;
      if (data.status !== undefined) productPatch.status = data.status;
      if (data.partner_commission_pct !== undefined) {
        productPatch.partner_commission_pct = data.partner_commission_pct;
      }
      if (Object.keys(productPatch).length > 0) {
        await tx.product.update({
          where: { id: existing.id },
          data: productPatch,
        });
      }

      // 2. Pricing — upsert mensual/anual si llegan.
      if (data.pricing) {
        for (const cycle of ['monthly', 'annual'] as const) {
          const pricingDto = data.pricing[cycle];
          if (!pricingDto) continue;
          await tx.productPricing.upsert({
            where: {
              product_id_billing_cycle_currency: {
                product_id: existing.id,
                billing_cycle: cycle,
                currency: pricingDto.currency ?? 'EUR',
              },
            },
            update: {
              price: pricingDto.price,
              setup_fee: pricingDto.setup_fee ?? 0,
              discount_percentage: pricingDto.discount_percentage ?? null,
              active: pricingDto.active ?? true,
            },
            create: {
              product_id: existing.id,
              billing_cycle: cycle,
              currency: pricingDto.currency ?? 'EUR',
              price: pricingDto.price,
              setup_fee: pricingDto.setup_fee ?? 0,
              discount_percentage: pricingDto.discount_percentage ?? null,
              active: pricingDto.active ?? true,
            },
          });
        }
      }

      // 3+4+5. Config (Slots + Soporte + cta_visibility).
      const configPatch: Prisma.SupportInsideConfigUpdateInput = {};
      if (data.slots_included !== undefined)
        configPatch.slots_included = data.slots_included;
      if (data.slot_types_allowed !== undefined)
        configPatch.slot_types_allowed = { set: data.slot_types_allowed };
      if (data.extra_slot_price !== undefined)
        configPatch.extra_slot_price = data.extra_slot_price;
      if (data.channels_active !== undefined)
        configPatch.channels_active = { set: data.channels_active };
      if (data.priority_tier !== undefined)
        configPatch.priority_tier = data.priority_tier;
      if (data.response_sla_hours !== undefined)
        configPatch.response_sla_hours = data.response_sla_hours;
      if (data.cta_visibility !== undefined)
        configPatch.cta_visibility = data.cta_visibility;

      if (Object.keys(configPatch).length > 0) {
        if (existing.support_inside_config) {
          await tx.supportInsideConfig.update({
            where: { product_id: existing.id },
            data: configPatch,
          });
        } else {
          // Nunca debería pasar (el seed siempre crea config para los 3
          // planes), pero defensa por si alguien aplica datos parciales.
          // Para create necesitamos los campos planos (no el shape Update
          // con `set:` para arrays), así que rearmamos desde el dto.
          await tx.supportInsideConfig.create({
            data: {
              product: { connect: { id: existing.id } },
              slots_included: data.slots_included ?? 0,
              slot_types_allowed: data.slot_types_allowed ?? [],
              extra_slot_price: data.extra_slot_price ?? 0,
              channels_active: data.channels_active ?? [],
              priority_tier: data.priority_tier ?? 'standard',
              response_sla_hours: data.response_sla_hours ?? 24,
              cta_visibility: data.cta_visibility ?? 'hidden',
            },
          });
        }
      }

      this.logger.log(
        `Plan Support Inside actualizado: slug=${slug} sections=${
          Object.keys({
            ...productPatch,
            ...configPatch,
            ...(data.pricing ?? {}),
          }).length
        }`,
      );

      return tx.product.findFirst({
        where: { slug, type: 'support_inside' },
        include: {
          support_inside_config: true,
          pricing: { orderBy: { billing_cycle: 'asc' } },
        },
      });
    });
  }
}

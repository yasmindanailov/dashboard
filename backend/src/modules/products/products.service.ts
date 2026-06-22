import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductPricingDto,
} from './dto/product.dto';
import { Prisma } from '@prisma/client';
import { ProductsCatalogService } from './products-catalog.service';

/* ═══════════════════════════════════════
   ProductsService — Product CRUD + facade
   for pricing and categories.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

/**
 * Contexto de compra de un producto para un usuario concreto (Sprint 15D F.4,
 * "Tienda consciente del estado"). Permite a la ficha de producto decidir el CTA
 * correcto (Contratar / Cambiar de plan / Ya lo tienes / Límite alcanzado) en
 * vez de dejar comprar y fallar en el checkout.
 */
export interface ProductPurchaseContext {
  canBuy: boolean;
  reason: 'ok' | 'owns_global_addon' | 'at_quantity_limit';
  /** Addon global de cuenta (Support Inside): uno activo por cliente. */
  isGlobalAddon: boolean;
  maxQuantity: number | null;
  currentQuantity: number;
  /** Si ya tiene el addon global: id de su suscripción (para "cambiar de plan"). */
  ownedSubscriptionId?: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductsCatalogService,
  ) {}

  /**
   * Reglas de compra de un producto para `userId` (Sprint 15D Fase 15D.F.4).
   * Espejo READ-ONLY de las que el checkout enforce (defense-in-depth): el
   * checkout sigue siendo la autoridad; esto solo guía el CTA de la Tienda.
   *   - Addon global (Support Inside / `is_global_addon`): 1 activo por cuenta.
   *   - `max_quantity_per_client`: tope de servicios activos del mismo producto.
   */
  async getPurchaseContext(
    userId: string,
    productId: string,
  ): Promise<ProductPurchaseContext> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        type: true,
        is_global_addon: true,
        max_quantity_per_client: true,
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');

    const isGlobalAddon =
      product.is_global_addon || product.type === 'support_inside';

    if (isGlobalAddon) {
      const sub = await this.prisma.supportInsideSubscription.findUnique({
        where: { client_id: userId },
        select: { id: true, status: true },
      });
      const owns = sub != null && sub.status === 'active';
      return {
        canBuy: !owns,
        reason: owns ? 'owns_global_addon' : 'ok',
        isGlobalAddon: true,
        maxQuantity: 1,
        currentQuantity: owns ? 1 : 0,
        ...(owns ? { ownedSubscriptionId: sub.id } : {}),
      };
    }

    if (product.max_quantity_per_client) {
      const currentQuantity = await this.prisma.service.count({
        where: {
          user_id: userId,
          product_id: productId,
          status: { notIn: ['cancelled', 'terminated'] },
        },
      });
      const canBuy = currentQuantity < product.max_quantity_per_client;
      return {
        canBuy,
        reason: canBuy ? 'ok' : 'at_quantity_limit',
        isGlobalAddon: false,
        maxQuantity: product.max_quantity_per_client,
        currentQuantity,
      };
    }

    return {
      canBuy: true,
      reason: 'ok',
      isGlobalAddon: false,
      maxQuantity: null,
      currentQuantity: 0,
    };
  }

  /* ── Slug helpers ── */

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async ensureUniqueSlug(
    slug: string,
    excludeId?: string,
  ): Promise<string> {
    let candidate = slug;
    let counter = 0;
    while (true) {
      const existing = await this.prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      counter++;
      candidate = `${slug}-${counter}`;
    }
  }

  /* ── List ── */

  async findAll(query: ProductListQueryDto): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, search, status, type, category_id } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (category_id) where.category_id = category_id;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { short_description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ order_index: 'asc' }, { created_at: 'desc' }],
        include: {
          category: { select: { id: true, name: true, slug: true } },
          pricing: {
            where: { active: true },
            orderBy: { billing_cycle: 'asc' },
          },
          _count: { select: { services: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  /* ── Detail ── */

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        pricing: { orderBy: { billing_cycle: 'asc' } },
        extras: { orderBy: { created_at: 'asc' } },
        checklist_items: { orderBy: { order_index: 'asc' } },
        _count: { select: { services: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return product;
  }

  /* ── Create ── */

  async create(dto: CreateProductDto) {
    const slug = await this.ensureUniqueSlug(
      dto.slug || this.generateSlug(dto.name),
    );

    if (dto.category_id) {
      const cat = await this.prisma.productCategory.findUnique({
        where: { id: dto.category_id },
        select: { id: true },
      });
      if (!cat)
        throw new BadRequestException('La categoría especificada no existe.');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: dto.name,
          slug,
          category_id: dto.category_id,
          description: dto.description,
          short_description: dto.short_description,
          type: dto.type,
          provisioner: dto.provisioner,
          image_url: dto.image_url,
          badge_text: dto.badge_text,
          order_index: dto.order_index ?? 0,
          is_addon: dto.is_addon ?? false,
          is_global_addon: dto.is_global_addon ?? false,
          requires_existing_product: dto.requires_existing_product ?? false,
          required_product_type: dto.required_product_type,
          max_quantity_per_client: dto.max_quantity_per_client,
          grace_period_days: dto.grace_period_days ?? 0,
          suspension_days: dto.suspension_days ?? 7,
          cancellation_days: dto.cancellation_days ?? 30,
          data_retention_days: dto.data_retention_days ?? 30,
          client_can_pause: dto.client_can_pause ?? false,
          pause_max_days: dto.pause_max_days,
          provisioner_config: dto.provisioner_config ?? Prisma.JsonNull,
          audit_event_types: dto.audit_event_types ?? Prisma.JsonNull,
          features: dto.features ?? Prisma.JsonNull,
          partner_commission_pct: dto.partner_commission_pct,
        },
      });

      if (dto.pricing?.length) {
        await tx.productPricing.createMany({
          data: dto.pricing.map((p) => ({
            product_id: product.id,
            billing_cycle: p.billing_cycle,
            price: p.price,
            setup_fee: p.setup_fee ?? 0,
            currency: p.currency ?? 'EUR',
            discount_percentage: p.discount_percentage,
            active: p.active ?? true,
          })),
        });
      }

      if (dto.extras?.length) {
        await tx.productExtra.createMany({
          data: dto.extras.map((e) => ({
            product_id: product.id,
            extra_product_id: e.extra_product_id,
            type: e.type,
            is_mandatory: e.is_mandatory,
            label: e.label,
            discount_percentage: e.discount_percentage,
            free_months: e.free_months,
            max_value_eur: e.max_value_eur,
            applicable_cycles: e.applicable_cycles,
            tld_restrictions: e.tld_restrictions ?? Prisma.JsonNull,
            max_uses: e.max_uses,
            active: e.active ?? true,
          })),
        });
      }

      if (dto.checklist_items?.length) {
        await tx.productChecklistItem.createMany({
          data: dto.checklist_items.map((c, i) => ({
            product_id: product.id,
            label: c.label,
            order_index: c.order_index ?? i,
            is_required: c.is_required ?? true,
          })),
        });
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          pricing: true,
          extras: true,
          checklist_items: { orderBy: { order_index: 'asc' } },
        },
      });
    });
  }

  /* ── Update ── */

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado.');

    if (dto.slug && dto.slug !== existing.slug) {
      const slugTaken = await this.prisma.product.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (slugTaken && slugTaken.id !== id)
        throw new ConflictException(
          `El slug "${dto.slug}" ya está en uso por otro producto.`,
        );
    }

    if (dto.category_id) {
      const cat = await this.prisma.productCategory.findUnique({
        where: { id: dto.category_id },
        select: { id: true },
      });
      if (!cat)
        throw new BadRequestException('La categoría especificada no existe.');
    }

    return this.prisma.product.update({
      where: { id },
      data: dto as Prisma.ProductUpdateInput,
      include: {
        category: true,
        pricing: true,
        extras: true,
        checklist_items: { orderBy: { order_index: 'asc' } },
      },
    });
  }

  /* ── Toggle / Delete ── */

  async toggleStatus(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    const newStatus = product.status === 'active' ? 'inactive' : 'active';
    return this.prisma.product.update({
      where: { id },
      data: { status: newStatus },
      select: { id: true, name: true, status: true },
    });
  }

  async delete(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { services: true } } },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    if (product._count.services > 0) {
      throw new ConflictException(
        `No se puede eliminar el producto "${product.name}" porque tiene ${product._count.services} servicio(s) asociado(s). Desactívalo en su lugar.`,
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Producto eliminado correctamente.' };
  }

  /* ── Catalog delegates (pricing + categories) ── */

  addPricing(productId: string, dto: ProductPricingDto) {
    return this.catalog.addPricing(productId, dto);
  }
  updatePricing(pricingId: string, dto: Partial<ProductPricingDto>) {
    return this.catalog.updatePricing(pricingId, dto);
  }
  deletePricing(pricingId: string) {
    return this.catalog.deletePricing(pricingId);
  }
  findAllCategories() {
    return this.catalog.findAllCategories();
  }
  createCategory(data: {
    name: string;
    slug: string;
    parent_id?: string;
    order_index?: number;
  }) {
    return this.catalog.createCategory(data);
  }
  updateCategory(
    id: string,
    data: {
      name?: string;
      slug?: string;
      order_index?: number;
      active?: boolean;
    },
  ) {
    return this.catalog.updateCategory(id, data);
  }
  deleteCategory(id: string) {
    return this.catalog.deleteCategory(id);
  }
}

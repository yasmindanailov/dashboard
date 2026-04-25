import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ProductPricingDto } from './dto/product.dto';

/* ═══════════════════════════════════════
   ProductsCatalogService — Pricing plans
   and categories management.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class ProductsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Pricing ── */

  async addPricing(productId: string, dto: ProductPricingDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');

    // EC-5: Check duplicate billing_cycle + currency
    const existing = await this.prisma.productPricing.findFirst({
      where: {
        product_id: productId,
        billing_cycle: dto.billing_cycle,
        currency: dto.currency ?? 'EUR',
      },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un plan de precio con ciclo "${dto.billing_cycle}" y moneda "${dto.currency ?? 'EUR'}" para este producto.`,
      );
    }

    return this.prisma.productPricing.create({
      data: {
        product_id: productId,
        billing_cycle: dto.billing_cycle,
        price: dto.price,
        setup_fee: dto.setup_fee ?? 0,
        currency: dto.currency ?? 'EUR',
        discount_percentage: dto.discount_percentage,
        active: dto.active ?? true,
      },
    });
  }

  async updatePricing(pricingId: string, dto: Partial<ProductPricingDto>) {
    const pricing = await this.prisma.productPricing.findUnique({
      where: { id: pricingId },
    });
    if (!pricing) throw new NotFoundException('Plan de precio no encontrado.');
    return this.prisma.productPricing.update({
      where: { id: pricingId },
      data: dto as any,
    });
  }

  async deletePricing(pricingId: string) {
    const pricing = await this.prisma.productPricing.findUnique({
      where: { id: pricingId },
    });
    if (!pricing) throw new NotFoundException('Plan de precio no encontrado.');

    // EC-3: Prevent deleting the last pricing plan of an active product
    const remaining = await this.prisma.productPricing.count({
      where: { product_id: pricing.product_id },
    });
    if (remaining <= 1) {
      const product = await this.prisma.product.findUnique({
        where: { id: pricing.product_id },
        select: { status: true },
      });
      if (product?.status === 'active') {
        throw new BadRequestException(
          'No se puede eliminar el último plan de precio de un producto activo.',
        );
      }
    }

    await this.prisma.productPricing.delete({ where: { id: pricingId } });
    return { message: 'Plan de precio eliminado.' };
  }

  /* ── Categories ── */

  async findAllCategories() {
    return this.prisma.productCategory.findMany({
      where: { active: true },
      orderBy: { order_index: 'asc' },
      include: {
        children: { orderBy: { order_index: 'asc' } },
        _count: { select: { products: true } },
      },
    });
  }

  async createCategory(data: {
    name: string;
    slug: string;
    parent_id?: string;
    order_index?: number;
  }) {
    const existingSlug = await this.prisma.productCategory.findUnique({
      where: { slug: data.slug },
    });
    if (existingSlug)
      throw new ConflictException('El slug de la categoría ya existe.');
    return this.prisma.productCategory.create({ data });
  }

  async updateCategory(
    id: string,
    data: {
      name?: string;
      slug?: string;
      order_index?: number;
      active?: boolean;
    },
  ) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Categoría no encontrada.');

    if (data.slug && data.slug !== cat.slug) {
      const dup = await this.prisma.productCategory.findUnique({
        where: { slug: data.slug },
      });
      if (dup)
        throw new ConflictException('El slug de la categoría ya existe.');
    }

    return this.prisma.productCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.productCategory.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!cat) throw new NotFoundException('Categoría no encontrada.');

    if (cat._count.products > 0) {
      throw new ConflictException(
        `No se puede eliminar la categoría "${cat.name}" porque tiene ${cat._count.products} producto(s) asociado(s).`,
      );
    }

    await this.prisma.productCategory.delete({ where: { id } });
    return { message: 'Categoría eliminada correctamente.' };
  }
}

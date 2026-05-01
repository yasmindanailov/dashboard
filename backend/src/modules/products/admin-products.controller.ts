import {
  Controller,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductPricingDto,
} from './dto/product.dto';
import { SupportInsideIsolationGuard } from './guards/support-inside-isolation.guard';

/**
 * AdminProductsController — operaciones admin del módulo Products
 * (Sprint 9.6 + ADR-068).
 *
 * Multi-path canónico `/api/v1/admin/products/*` con alias legacy
 * `/api/v1/products/*` durante ventana de deprecación (Sunset
 * Wed, 31 Dec 2026 23:59:59 GMT — cerrado en commit pre-deploy Sprint 14).
 * El `LegacyRouteDeprecationMiddleware` añade headers `Deprecation: true`
 * + `Sunset` + `Link` solo a las llamadas al path legacy.
 *
 * Las lecturas (`GET /products`, `GET /products/:id`,
 * `GET /products/categories/all`) viven en `ProductsController` SIN multi-path
 * — son endpoint canónico público bajo CASL `Read.Product`/`List.Product`,
 * accesible por cliente para futuro Sprint 18 (Landing Integration). Las
 * mutaciones aquí (CRUD producto + pricing + categorías mutaciones) son
 * staff-puro: triple guard JwtAuthGuard + AdminOnlyGuard + PoliciesGuard.
 *
 * NestJS desambigua por método HTTP: `POST /api/v1/products` golpea este
 * controller (mutación), `GET /api/v1/products` golpea `ProductsController`
 * (lectura pública). No hay colisión.
 */
@ApiTags('Admin / Products')
@ApiBearerAuth()
@Controller(['admin/products', 'products'])
@UseGuards(
  JwtAuthGuard,
  AdminOnlyGuard,
  PoliciesGuard,
  SupportInsideIsolationGuard,
)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /* ═══════════════════════════════════════
     PRODUCTS — mutaciones
     ═══════════════════════════════════════ */

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Product))
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  toggleStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.toggleStatus(id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can(Action.Delete, Subject.Product))
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.delete(id);
  }

  /* ═══════════════════════════════════════
     PRICING
     ═══════════════════════════════════════ */

  @Post(':id/pricing')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  addPricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductPricingDto,
  ) {
    return this.productsService.addPricing(id, dto);
  }

  @Patch('pricing/:pricingId')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  updatePricing(
    @Param('pricingId', ParseUUIDPipe) pricingId: string,
    @Body() dto: ProductPricingDto,
  ) {
    return this.productsService.updatePricing(pricingId, dto);
  }

  @Delete('pricing/:pricingId')
  @CheckPolicies((ability) => ability.can(Action.Delete, Subject.Product))
  deletePricing(@Param('pricingId', ParseUUIDPipe) pricingId: string) {
    return this.productsService.deletePricing(pricingId);
  }

  /* ═══════════════════════════════════════
     CATEGORIES — mutaciones (la lectura `categories/all` está en ProductsController)
     ═══════════════════════════════════════ */

  @Post('categories')
  @CheckPolicies((ability) =>
    ability.can(Action.Create, Subject.ProductCategory),
  )
  createCategory(
    @Body()
    data: {
      name: string;
      slug: string;
      parent_id?: string;
      order_index?: number;
    },
  ) {
    return this.productsService.createCategory(data);
  }

  @Patch('categories/:id')
  @CheckPolicies((ability) =>
    ability.can(Action.Update, Subject.ProductCategory),
  )
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    data: {
      name?: string;
      slug?: string;
      order_index?: number;
      active?: boolean;
    },
  ) {
    return this.productsService.updateCategory(id, data);
  }

  @Delete('categories/:id')
  @CheckPolicies((ability) =>
    ability.can(Action.Delete, Subject.ProductCategory),
  )
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.deleteCategory(id);
  }
}

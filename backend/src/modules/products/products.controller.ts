import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { ProductsService } from './products.service';
import { ProductListQueryDto } from './dto/product-list-query.dto';

/**
 * ProductsController — lectura pública del catálogo (Sprint 9.6 + ADR-068).
 *
 * Endpoint canónico bajo `/api/v1/products` (sin prefijo `/admin`). Es el
 * único endpoint del módulo Products visible al rol cliente: el cliente
 * tiene `[Read, List] Product` en CASL y necesita poder consultar el
 * catálogo desde su Portal de Cliente para futuro Sprint 18 (Landing
 * Integration). Las mutaciones (CRUD + pricing + categorías) viven en
 * `AdminProductsController` con multi-path admin/legacy.
 *
 * NO se expone aquí ningún endpoint admin (no hay alias legacy en este
 * controller). Las llamadas legacy a `POST /api/v1/products`, `PATCH
 * /api/v1/products/:id`, etc. siguen funcionando vía
 * `AdminProductsController @Controller(['admin/products', 'products'])`
 * — NestJS desambigua por método HTTP.
 */
@ApiTags('Products')
@Controller('products')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.List, Subject.Product))
  findAll(@Query() query: ProductListQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Product))
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  /**
   * Sprint 15D Fase 15D.F.4 — contexto de compra del producto para el usuario
   * autenticado (Tienda consciente del estado): ¿puede comprarlo, ya lo tiene
   * (addon global), o alcanzó el límite? Read-only; el checkout es la autoridad.
   */
  @Get(':id/purchase-context')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Product))
  getPurchaseContext(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.getPurchaseContext(req.user.id, id);
  }

  @Get('categories/all')
  @CheckPolicies((ability) => ability.can(Action.List, Subject.ProductCategory))
  findAllCategories() {
    return this.productsService.findAllCategories();
  }
}

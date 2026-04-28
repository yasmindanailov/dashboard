import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ProductsService } from './products.service';
import { ProductsCatalogService } from './products-catalog.service';
import { ProductsController } from './products.controller';
import { AdminProductsController } from './admin-products.controller';

/**
 * Sprint 9.6 (ADR-068): split del controller original en dos.
 *  - `ProductsController` — lectura pública canónica (`GET /products[/...]`).
 *  - `AdminProductsController` — mutaciones admin con multi-path
 *    `/admin/products/*` + alias legacy `/products/*` durante deprecación.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsCatalogService, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

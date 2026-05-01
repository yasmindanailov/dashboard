import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ProductsService } from './products.service';
import { ProductsCatalogService } from './products-catalog.service';
import { ProductsController } from './products.controller';
import { AdminProductsController } from './admin-products.controller';
import { SupportInsideIsolationGuard } from './guards/support-inside-isolation.guard';

/**
 * Sprint 9.6 (ADR-068): split del controller original en dos.
 *  - `ProductsController` — lectura pública canónica (`GET /products[/...]`).
 *  - `AdminProductsController` — mutaciones admin con multi-path
 *    `/admin/products/*` + alias legacy `/products/*` durante deprecación.
 *
 * Sprint 8 Fase D + ADR-075: el `SupportInsideIsolationGuard` se aplica al
 * `AdminProductsController` para rechazar mutaciones sobre type=support_inside
 * salvo desde la página dedicada `/admin/support-inside-plans` (header
 * interno X-Aelium-Source: support-inside-admin).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [
    ProductsCatalogService,
    ProductsService,
    SupportInsideIsolationGuard,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}

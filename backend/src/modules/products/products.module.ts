import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ProductsService } from './products.service';
import { ProductsCatalogService } from './products-catalog.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsCatalogService, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

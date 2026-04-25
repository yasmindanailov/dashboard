import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { ProductsService } from './products.service';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductPricingDto,
} from './dto/product.dto';

@ApiTags('Products')
@Controller('products')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /* ═══════════════════════════════════════
     PRODUCTS CRUD
     ═══════════════════════════════════════ */

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
     CATEGORIES
     ═══════════════════════════════════════ */

  @Get('categories/all')
  @CheckPolicies((ability) => ability.can(Action.List, Subject.ProductCategory))
  findAllCategories() {
    return this.productsService.findAllCategories();
  }

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

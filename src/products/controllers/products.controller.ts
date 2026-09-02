import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import { Product } from '../entities/product.entity.js';
import {
  ProductListingPage,
  ProductsService,
} from '../services/products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: ListProductsQueryDto): Promise<ProductListingPage> {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Product> {
    return this.productsService.findOne(id);
  }
}

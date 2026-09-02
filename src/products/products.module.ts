import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from './entities/productCategory.entity.js';
import { Product } from './entities/product.entity.js';
import { Promotion } from './entities/promotion.entity.js';
import { ProductsController } from '../products/controllers/products.controller.js';
import { ProductsService } from '../products/services/products.service.js';
import { PromotionsController } from './controllers/promotions.controller.js';
import { PromotionsService } from './services/promotions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCategory, Promotion])],
  controllers: [ProductsController, PromotionsController],
  providers: [ProductsService, PromotionsService],
})
export class ProductsModule {}

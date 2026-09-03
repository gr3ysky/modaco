import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategoryEntity } from './entities/productCategory.entity.js';
import { ProductEntity } from './entities/product.entity.js';
import { Promotion } from './entities/promotion.entity.js';
import { ProductsController } from '../products/controllers/products.controller.js';
import { ProductsService } from '../products/services/products.service.js';
import { PromotionsController } from './controllers/promotions.controller.js';
import { PromotionsService } from './services/promotions.service.js';
import { ProductImportService } from './services/productImport.service.js';
import { ProductImportEntity } from './entities/productImport.entity.js';
import { ScheduleModule } from '@nestjs/schedule';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductEntity,
      ProductCategoryEntity,
      Promotion,
      ProductImportEntity,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [ProductsController, PromotionsController],
  providers: [ProductsService, PromotionsService, ProductImportService],
})
export class ProductsModule {}

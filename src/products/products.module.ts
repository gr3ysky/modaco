import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategoryEntity } from './entities/productCategory.entity.js';
import { ProductEntity } from './entities/product.entity.js';
import { PromotionEntity } from './entities/promotion.entity.js';
import { ProductsController } from '../products/controllers/products.controller.js';
import { ProductsService } from '../products/services/products.service.js';
import { PromotionsController } from './controllers/promotions.controller.js';
import { PromotionsService } from './services/promotions.service.js';
import { FileImportService } from './services/fileImport.service.js';
import { FileImportEntity } from './entities/fileImport.entity.js';
import { ScheduleModule } from '@nestjs/schedule';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductEntity,
      ProductCategoryEntity,
      PromotionEntity,
      FileImportEntity,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [ProductsController, PromotionsController],
  providers: [ProductsService, PromotionsService, FileImportService],
})
export class ProductsModule {}

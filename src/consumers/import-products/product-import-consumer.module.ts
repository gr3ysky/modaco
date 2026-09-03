import { Module } from '@nestjs/common';
import { ProductImportConsumerService } from './product-import-consumer.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from '../../products/entities/product.entity.js';
import { ProductCategoryEntity } from '../../products/entities/productCategory.entity.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductImportService } from './productImport.service.js';
import { PromotionEntity } from '../../products/entities/promotion.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: Number(configService.getOrThrow<string>('DB_PORT')),
        username: configService.getOrThrow<string>('DB_USER'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
      }),
    }),
    TypeOrmModule.forFeature([
      ProductEntity,
      ProductCategoryEntity,
      PromotionEntity,
    ]),
  ],
  providers: [ProductImportConsumerService, ProductImportService],
})
export class ProductImportConsumerModule {}

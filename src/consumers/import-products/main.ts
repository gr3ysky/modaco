import { NestFactory } from '@nestjs/core';
import { ProductImportConsumerModule } from './product-import-consumer.module.js';

await NestFactory.createApplicationContext(ProductImportConsumerModule);

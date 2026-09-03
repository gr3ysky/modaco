import { Injectable, Logger } from '@nestjs/common';
import {
  ProductImportEntity,
  ProductImportStatus,
} from '../entities/productImport.entity.js';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import * as fs from 'fs';
import csv from 'csv-parser';
import { ProductEntity } from '../entities/product.entity.js';
import { ProductCategoryEntity } from '../entities/productCategory.entity.js';

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);
  private readonly BATCH_SIZE = 1000;
  constructor(
    @InjectRepository(ProductImportEntity)
    private readonly productImportRepository: Repository<ProductImportEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
    @InjectRepository(ProductCategoryEntity)
    private readonly productCategoryRepository: Repository<ProductCategoryEntity>,
  ) {}

  async createProductImport(file: string): Promise<ProductImportEntity> {
    const productImportEntity = await this.productImportRepository.save(
      this.productImportRepository.create({
        file,
        status: ProductImportStatus.CREATED,
        createdAt: new Date(),
      }),
    );
    return productImportEntity;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processProductImport(): Promise<void> {
    this.logger.log('Processing product import...');
    //find the product import entities with status CREATED  or FAILED and process them
    const productImportTask = await this.productImportRepository.findOne({
      where: {
        status: In([ProductImportStatus.CREATED, ProductImportStatus.FAILED]),
      },
    });

    if (!productImportTask) {
      this.logger.log('No product import tasks to process.');
      return;
    }

    try {
      // Acquires lock for the product import task to prevent concurrent processing
      await this.productImportRepository.query(
        'SELECT pg_advisory_lock(hashtext($1))',
        [productImportTask.file],
      );
      await this.process(productImportTask);
    } catch (error: any) {
      this.logger.error(
        `Product import task ${productImportTask.id} failed: ${error.message}`,
      );
      await this.setProductImportFailed(productImportTask);
    } finally {
      // Releases lock for the product import task after processing
      await this.productImportRepository.query(
        'SELECT pg_advisory_unlock(hashtext($1))',
        [productImportTask.file],
      );
    }
  }
  //TODO: add error handling for partially completed imports, and implement a retry mechanism for failed imports. Also, consider adding a notification system to alert when an import fails.
  //TODO: implement better validating for parsing Product while reading the CSV file, and handle cases where the CSV file is malformed or contains invalid data.
  private async process(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    this.logger.log(`Processing file ${productImportEntity.file}...`);
    try {
      await this.setProductImportStarted(productImportEntity);
      const productCategories = await this.productCategoryRepository.find();
      let batchBuffer: ProductEntity[] = [];
      let totalProcessed = 0;
      const fileStream = fs
        .createReadStream(productImportEntity.file)
        .pipe(csv());

      for await (const row of fileStream) {
        //(name, sku, basePrice, stockQuantity, category);
        let productCategory = productCategories.find(
          (category) =>
            category.name.toLowerCase() ===
            row['category'].trim().toLowerCase(),
        );
        if (!productCategory) {
          productCategory = await this.productCategoryRepository.save(
            this.productCategoryRepository.create({
              name: row['category'].trim(),
            }),
          );
        }
        const productEntity = this.productRepository.create({
          name: row['name'],
          sku: row['sku'],
          basePrice: parseFloat(row['basePrice']),
          stockQuantity: parseInt(row['stockQuantity']),
          category: productCategory,
        } satisfies Omit<ProductEntity, 'id' | 'promotions'>);

        batchBuffer.push(productEntity);
        if (batchBuffer.length >= this.BATCH_SIZE) {
          await this.productRepository.save(batchBuffer);
          totalProcessed += batchBuffer.length;
          this.logger.log(
            `Processed ${totalProcessed} products from file ${productImportEntity.file}`,
          );
          batchBuffer = [];
        }
      }
      if (batchBuffer.length > 0) {
        await this.productRepository.save(batchBuffer);
        totalProcessed += batchBuffer.length;
        this.logger.log(
          `Processed ${totalProcessed} products from file ${productImportEntity.file}`,
        );
      }
      await this.setProductImportCompleted(productImportEntity);
    } catch (error: any) {
      this.logger.error(
        `Error processing file ${productImportEntity.file}: ${error.message}`,
      );
      await this.setProductImportFailed(productImportEntity);
      throw error;
    }
  }

  private async setProductImportStarted(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    await this.productImportRepository.update(productImportEntity.id, {
      status: ProductImportStatus.PROCESSING,
      processStartedAt: new Date(),
    });
  }
  private async setProductImportCompleted(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    await this.productImportRepository.update(productImportEntity.id, {
      status: ProductImportStatus.COMPLETED,
      processCompletedAt: new Date(),
    });
  }
  private async setProductImportFailed(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    await this.productImportRepository.update(productImportEntity.id, {
      status: ProductImportStatus.FAILED,
    });
  }
}

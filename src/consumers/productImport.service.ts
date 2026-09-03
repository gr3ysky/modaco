import { Injectable, Logger } from '@nestjs/common';
import { ProductCategoryEntity } from '../products/entities/productCategory.entity.js';
import { ProductEntity } from '../products/entities/product.entity.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ProductImportService {
  private readonly productCategoryCache: Map<string, ProductCategoryEntity> =
    new Map();
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepository: Repository<ProductEntity>,
    @InjectRepository(ProductCategoryEntity)
    private readonly productCategoriesRepository: Repository<ProductCategoryEntity>,
  ) {}
  async tryProcessProductImportRaw(rawData: string): Promise<boolean> {
    try {
      const parsedEntity = JSON.parse(rawData);
      const categoryName = parsedEntity['category'];
      if (!categoryName) {
        return false;
      }
      const category = await this.addOrGetCategoryFromCache(categoryName);
      const name = parsedEntity['name'];
      const sku = parsedEntity['sku'];
      const basePrice = Number(parsedEntity['basePrice']);
      const stockQuantity = Number(parsedEntity['stockQuantity']);

      if (
        !name ||
        !sku ||
        isNaN(basePrice) ||
        isNaN(stockQuantity) ||
        basePrice < 0 ||
        stockQuantity < 0
      ) {
        return false;
      }

      await this.productsRepository.upsert(
        {
          name,
          sku,
          basePrice,
          stockQuantity,
          category,
        } as Omit<ProductEntity, 'id' | 'promotions'>,
        {
          conflictPaths: ['sku'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to process product import raw data: ${error.message}`,
      );
      return false;
    }
  }

  private async addOrGetCategoryFromCache(
    categoryName: string,
  ): Promise<ProductCategoryEntity> {
    if (this.productCategoryCache.size === 0) {
      const categories = await this.productCategoriesRepository.find();
      for (const category of categories) {
        this.productCategoryCache.set(category.name, category);
      }
    }

    if (this.productCategoryCache.has(categoryName)) {
      return this.productCategoryCache.get(categoryName)!;
    }

    const category = await this.productCategoriesRepository.save(
      this.productCategoriesRepository.create({
        name: categoryName,
      }),
    );
    this.productCategoryCache.set(categoryName, category);
    return category;
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignPromotionDto } from '../dto/assign-promotion.dto.js';
import { CreatePromotionDto } from '../dto/create-promotion.dto.js';
import { ProductCategoryEntity } from '../entities/productCategory.entity.js';
import { Promotion } from '../entities/promotion.entity.js';
import { ProductEntity } from '../entities/product.entity.js';

type PromotionTarget = {
  product: ProductEntity | null;
  category: ProductCategoryEntity | null;
  categoryId: string;
};

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionsRepository: Repository<Promotion>,
    @InjectRepository(ProductEntity)
    private readonly productsRepository: Repository<ProductEntity>,
    @InjectRepository(ProductCategoryEntity)
    private readonly categoriesRepository: Repository<ProductCategoryEntity>,
  ) {}

  async create(input: CreatePromotionDto): Promise<Promotion> {
    const details = {
      name: input.name,
      discountType: input.discountType,
      value: String(input.value),
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    };
    const target = await this.resolveTarget(input);

    await this.ensureNoConflict({
      startDate: details.startDate,
      endDate: details.endDate,
      productId: target.product?.id,
      categoryId: target.categoryId,
    });

    const promotion = await this.promotionsRepository.save(
      this.promotionsRepository.create({
        ...details,
        product: target.product,
        category: target.category,
      }),
    );
    return promotion;
  }

  async assign(id: string, input: AssignPromotionDto): Promise<Promotion> {
    const promotion = await this.findById(id);
    const target = await this.resolveTarget(input);
    await this.ensureNoConflict({
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      productId: target.product?.id,
      categoryId: target.categoryId,
      excludedPromotionId: promotion.id,
    });

    promotion.product = target.product;
    promotion.category = target.category;
    const assignedPromotion = await this.promotionsRepository.save(promotion);
    return assignedPromotion;
  }

  async cancel(id: string): Promise<Promotion> {
    const promotion = await this.findById(id);
    promotion.product = null;
    promotion.category = null;
    const cancelledPromotion = await this.promotionsRepository.save(promotion);
    return cancelledPromotion;
  }

  private async resolveTarget(
    input: AssignPromotionDto,
  ): Promise<PromotionTarget> {
    if (input.productId !== undefined) {
      const productId = input.productId;
      const product = await this.productsRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .where('product.id = :productId', { productId })
        .getOne();
      if (!product) {
        throw new NotFoundException(
          `Product with ID ${productId} was not found`,
        );
      }

      return { product, category: null, categoryId: product.category.id };
    }

    const categoryId = input.categoryId!;
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with ID ${categoryId} was not found`,
      );
    }

    return { product: null, category, categoryId: category.id };
  }

  private async ensureNoConflict({
    startDate,
    endDate,
    productId,
    categoryId,
    excludedPromotionId,
  }: {
    startDate: Date;
    endDate: Date;
    productId?: string;
    categoryId: string;
    excludedPromotionId?: string;
  }): Promise<void> {
    const query = this.promotionsRepository
      .createQueryBuilder('promotion')
      .leftJoin('promotion.product', 'promotedProduct')
      .where(
        'promotion.start_date < :endDate AND promotion.end_date > :startDate',
        {
          startDate,
          endDate,
        },
      );

    if (excludedPromotionId) {
      query.andWhere('promotion.id != :excludedPromotionId', {
        excludedPromotionId,
      });
    }

    if (productId) {
      query.andWhere(
        '(promotion.product_id = :productId OR promotion.category_id = :categoryId)',
        { productId, categoryId },
      );
    } else {
      query.andWhere(
        '(promotion.category_id = :categoryId OR promotedProduct.category_id = :categoryId)',
        { categoryId },
      );
    }

    if (await query.getExists()) {
      throw new ConflictException(
        'This promotion overlaps an active promotion for at least one affected product',
      );
    }
  }

  private async findById(id: string): Promise<Promotion> {
    const promotion = await this.promotionsRepository.findOne({
      where: { id },
    });
    if (!promotion) {
      throw new NotFoundException(`Promotion with ID ${id} was not found`);
    }
    return promotion;
  }
}

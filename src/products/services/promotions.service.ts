import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignPromotionDto } from '../dto/assign-promotion.dto.js';
import { CreatePromotionDto } from '../dto/create-promotion.dto.js';
import { ProductCategoryEntity } from '../entities/productCategory.entity.js';
import {
  Promotion,
  PromotionDiscountType,
} from '../entities/promotion.entity.js';
import { ProductEntity } from '../entities/product.entity.js';

type PromotionTarget = {
  product: ProductEntity | null;
  category: ProductCategoryEntity | null;
  categoryId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const details = this.validatePromotionDetails(input);
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

  private validatePromotionDetails(input: CreatePromotionDto) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 255) {
      throw new BadRequestException(
        'Promotion name must be between 1 and 255 characters',
      );
    }

    if (
      !Object.values(PromotionDiscountType).includes(
        input.discountType as PromotionDiscountType,
      )
    ) {
      throw new BadRequestException(
        'discountType must be percentage or fixed_amount',
      );
    }

    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(
        'Promotion value must be greater than zero',
      );
    }
    if (
      input.discountType === PromotionDiscountType.PERCENTAGE &&
      value > 100
    ) {
      throw new BadRequestException('Percentage promotions cannot exceed 100');
    }

    const startDate = this.parseDate(input.startDate, 'startDate');
    const endDate = this.parseDate(input.endDate, 'endDate');
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }

    return {
      name,
      discountType: input.discountType as PromotionDiscountType,
      value: String(value),
      startDate,
      endDate,
    };
  }

  private async resolveTarget(
    input: AssignPromotionDto,
  ): Promise<PromotionTarget> {
    const hasProduct =
      typeof input.productId === 'string' && input.productId.length > 0;
    const hasCategory =
      typeof input.categoryId === 'string' && input.categoryId.length > 0;
    if (hasProduct === hasCategory) {
      throw new BadRequestException(
        'Assign the promotion to exactly one product or category',
      );
    }

    if (hasProduct) {
      const productId = input.productId as string;
      this.assertUuid(productId, 'productId');
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

    const categoryId = input.categoryId as string;
    this.assertUuid(categoryId, 'categoryId');
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

  private parseDate(value: unknown, field: string): Date {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be an ISO-8601 date string`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${field} must be a UUID`);
    }
  }
}

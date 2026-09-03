import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import { ProductEntity } from '../entities/product.entity.js';

type SortOrder = 'ASC' | 'DESC';

export type ProductListing = {
  productId: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  basePrice: string;
  stockQuantity: number;
  activePromotionId: string | null;
  activeDiscountType: string | null;
  activeDiscountValue: string | null;
  effectivePrice: string;
};

export type ProductListingPage = {
  data: ProductListing[];
  pagination: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
    sortOrder: Lowercase<SortOrder>;
  };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepository: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ListProductsQueryDto): Promise<ProductListingPage> {
    const categoryId = this.parseCategoryId(query.categoryId);
    const page = this.parsePositiveInteger(query.page, 'page', 1);
    const size = this.parsePositiveInteger(query.size, 'size', 20);
    const sortOrder = this.parseSortOrder(query.sortOrder);
    const offset = (page - 1) * size;

    const effectivePrice = `
      CASE
        WHEN active_promotion.discount_type = 'percentage'
          THEN ROUND(product.base_price * (1 - active_promotion.value / 100), 2)
        WHEN active_promotion.discount_type = 'fixed_amount'
          THEN GREATEST(product.base_price - active_promotion.value, 0::numeric)
        ELSE product.base_price
      END
    `;
    const parameters: unknown[] = [];
    const conditions: string[] = [];

    if (categoryId) {
      parameters.push(categoryId);
      conditions.push(`product.category_id = $${parameters.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const countResult = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*) AS "total" FROM products AS product ${whereClause}`,
      parameters,
    );
    const total = Number(countResult[0]?.total ?? 0);

    parameters.push(size, offset);
    const rows = await this.dataSource.query<ProductListing[]>(
      `
        SELECT
          product.id AS "productId",
          product.name AS "name",
          product.sku AS "sku",
          product.category_id AS "categoryId",
          category.name AS "categoryName",
          product.base_price AS "basePrice",
          product.stock_quantity AS "stockQuantity",
          active_promotion.id AS "activePromotionId",
          active_promotion.discount_type AS "activeDiscountType",
          active_promotion.value AS "activeDiscountValue",
          ${effectivePrice} AS "effectivePrice"
        FROM products AS product
        JOIN product_categories AS category ON category.id = product.category_id
        LEFT JOIN LATERAL (
          SELECT promotion.id, promotion.discount_type, promotion.value
          FROM promotions AS promotion
          WHERE (promotion.product_id = product.id OR promotion.category_id = product.category_id)
            AND promotion.start_date <= CURRENT_TIMESTAMP
            AND promotion.end_date > CURRENT_TIMESTAMP
          ORDER BY
            CASE WHEN promotion.product_id = product.id THEN 0 ELSE 1 END,
            promotion.start_date DESC,
            promotion.id
          LIMIT 1
        ) AS active_promotion ON TRUE
        ${whereClause}
        ORDER BY ${effectivePrice} ${sortOrder}, product.id ASC
        LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
      `,
      parameters,
    );

    return {
      data: rows,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
        sortOrder: sortOrder.toLowerCase() as Lowercase<SortOrder>,
      },
    };
  }

  async findOne(id: string): Promise<ProductEntity> {
    const now = new Date();
    const product = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect(
        'product.promotions',
        'productPromotion',
        'productPromotion.start_date <= :now AND productPromotion.end_date > :now',
        { now },
      )
      .leftJoinAndSelect(
        'category.promotions',
        'categoryPromotion',
        'categoryPromotion.start_date <= :now AND categoryPromotion.end_date > :now',
        { now },
      )
      .where('product.id = :id', { id })
      .getOne();

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} was not found`);
    }

    return product;
  }

  private parseCategoryId(value: unknown): string | null {
    if (value === undefined) {
      return null;
    }
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException('categoryId must be a UUID');
    }
    return value;
  }

  private parsePositiveInteger(
    value: unknown,
    field: 'page' | 'size',
    defaultValue: number,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    const parsedValue = Number(value);
    if (field === 'size' && parsedValue > 100) {
      throw new BadRequestException('size cannot exceed 100');
    }
    return parsedValue;
  }

  private parseSortOrder(value: unknown): SortOrder {
    if (value === undefined) {
      return 'ASC';
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('sortOrder must be asc or desc');
    }
    const sortOrder = value.toUpperCase();
    if (sortOrder !== 'ASC' && sortOrder !== 'DESC') {
      throw new BadRequestException('sortOrder must be asc or desc');
    }
    return sortOrder;
  }
}

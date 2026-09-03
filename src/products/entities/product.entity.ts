import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ProductCategoryEntity } from './productCategory.entity.js';
import { PromotionEntity } from './promotion.entity.js';

@Entity({ name: 'products' })
@Index('IDX_products_category_base_price', ['category', 'basePrice', 'id'])
@Check('"base_price" >= 0')
@Check('"stock_quantity" >= 0')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  // Numeric columns are represented as strings to preserve decimal precision.
  @Column({ name: 'base_price', type: 'numeric', precision: 12, scale: 2 })
  basePrice: number;

  @Column({ name: 'stock_quantity', type: 'integer', default: 0 })
  stockQuantity: number;

  @ManyToOne(() => ProductCategoryEntity, (category) => category.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: Relation<ProductCategoryEntity>;

  @OneToMany(() => PromotionEntity, (promotion) => promotion.product)
  promotions: PromotionEntity[];
}

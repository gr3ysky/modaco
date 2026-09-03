import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductCategoryEntity } from './productCategory.entity.js';
import { ProductEntity } from './product.entity.js';

export enum PromotionDiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
}

@Entity({ name: 'promotions' })
@Index('IDX_promotions_product_active_window', [
  'product',
  'startDate',
  'endDate',
])
@Index('IDX_promotions_category_active_window', [
  'category',
  'startDate',
  'endDate',
])
@Check('"value" >= 0')
@Check('"start_date" < "end_date"')
@Check('NOT ("product_id" IS NOT NULL AND "category_id" IS NOT NULL)')
export class PromotionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: PromotionDiscountType,
    enumName: 'promotion_discount_type_enum',
  })
  discountType: PromotionDiscountType;

  // Percentage discounts use 0-100; fixed discounts use the product currency.
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  value: string;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @ManyToOne(() => ProductEntity, (product) => product.promotions, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: ProductEntity | null;

  @ManyToOne(() => ProductCategoryEntity, (category) => category.promotions, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategoryEntity | null;
}

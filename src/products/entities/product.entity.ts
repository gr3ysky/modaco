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
import { ProductCategory } from './productCategory.entity.js';
import { Promotion } from './promotion.entity.js';

@Entity({ name: 'products' })
@Index('IDX_products_category_base_price', ['category', 'basePrice', 'id'])
@Check('"base_price" >= 0')
@Check('"stock_quantity" >= 0')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  // Numeric columns are represented as strings to preserve decimal precision.
  @Column({ name: 'base_price', type: 'numeric', precision: 12, scale: 2 })
  basePrice: string;

  @Column({ name: 'stock_quantity', type: 'integer', default: 0 })
  stockQuantity: number;

  @ManyToOne(() => ProductCategory, (category) => category.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: Relation<ProductCategory>;

  @OneToMany(() => Promotion, (promotion) => promotion.product)
  promotions: Promotion[];
}

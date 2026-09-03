import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ProductEntity } from './product.entity.js';
import { Promotion } from './promotion.entity.js';

@Entity({ name: 'product_categories' })
export class ProductCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  @OneToMany(() => ProductEntity, (product) => product.category)
  products: ProductEntity[];

  @OneToMany(() => Promotion, (promotion) => promotion.category)
  promotions: Promotion[];
}

import { PromotionDiscountType } from '../entities/promotion.entity.js';

export class CreatePromotionDto {
  name: unknown;
  discountType: PromotionDiscountType | unknown;
  value: unknown;
  startDate: unknown;
  endDate: unknown;
  productId?: unknown;
  categoryId?: unknown;
}

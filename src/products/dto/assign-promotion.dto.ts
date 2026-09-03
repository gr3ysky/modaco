import { IsOptional, IsUUID, Validate } from 'class-validator';
import { ExactlyOnePromotionTargetConstraint } from './promotion-validation.js';

export class AssignPromotionDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @Validate(ExactlyOnePromotionTargetConstraint)
  readonly promotionTarget?: undefined;
}

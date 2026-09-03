import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { PromotionDiscountType } from '../entities/promotion.entity.js';
import {
  ExactlyOnePromotionTargetConstraint,
  PromotionDateRangeConstraint,
  PromotionDiscountValueConstraint,
} from './promotion-validation.js';

export class CreatePromotionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(PromotionDiscountType)
  discountType: PromotionDiscountType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Validate(PromotionDiscountValueConstraint)
  value: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @Validate(PromotionDateRangeConstraint)
  endDate: string;

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @Validate(ExactlyOnePromotionTargetConstraint)
  readonly promotionTarget?: undefined;
}

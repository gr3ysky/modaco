import {
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { PromotionDiscountType } from '../entities/promotion.entity.js';

type PromotionTargetDto = {
  productId?: string;
  categoryId?: string;
};

@ValidatorConstraint({ name: 'exactlyOnePromotionTarget', async: false })
export class ExactlyOnePromotionTargetConstraint
  implements ValidatorConstraintInterface
{
  validate(_: undefined, args: ValidationArguments): boolean {
    const { productId, categoryId } = args.object as PromotionTargetDto;
    return (productId !== undefined) !== (categoryId !== undefined);
  }

  defaultMessage(): string {
    return 'Assign the promotion to exactly one product or category';
  }
}

@ValidatorConstraint({ name: 'promotionDateRange', async: false })
export class PromotionDateRangeConstraint implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments): boolean {
    const { startDate } = args.object as { startDate: string };
    return new Date(startDate) < new Date(endDate);
  }

  defaultMessage(): string {
    return 'startDate must be before endDate';
  }
}

@ValidatorConstraint({ name: 'promotionDiscountValue', async: false })
export class PromotionDiscountValueConstraint
  implements ValidatorConstraintInterface
{
  validate(value: number, args: ValidationArguments): boolean {
    const { discountType } = args.object as {
      discountType: PromotionDiscountType;
    };
    return (
      discountType !== PromotionDiscountType.PERCENTAGE || value <= 100
    );
  }

  defaultMessage(): string {
    return 'Percentage promotions cannot exceed 100';
  }
}

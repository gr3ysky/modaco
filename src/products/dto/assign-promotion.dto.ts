import { IsOptional, IsUUID } from 'class-validator';

export class AssignPromotionDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;
}

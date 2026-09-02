import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AssignPromotionDto } from '../dto/assign-promotion.dto.js';
import { CreatePromotionDto } from '../dto/create-promotion.dto.js';
import { Promotion } from '../entities/promotion.entity.js';
import { PromotionsService } from '../services/promotions.service.js';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  create(@Body() input: CreatePromotionDto): Promise<Promotion> {
    return this.promotionsService.create(input);
  }

  @Patch(':id/assignment')
  assign(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: AssignPromotionDto,
  ): Promise<Promotion> {
    return this.promotionsService.assign(id, input);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Promotion> {
    return this.promotionsService.cancel(id);
  }
}

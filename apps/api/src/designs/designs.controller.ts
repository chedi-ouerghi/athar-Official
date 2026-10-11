import { Controller, Get, Param } from '@nestjs/common';
import {
  designParamsSchema,
  type DesignParams,
  type GetDesignResponse,
  type ListDesignsResponse,
} from '@athar/contracts';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { DesignsService } from './designs.service.js';

/**
 * The design library, `/api/v1/designs`. Public: designs are the same for every
 * visitor and contain nothing sensitive.
 */
@Controller('designs')
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  list(): ListDesignsResponse {
    return this.designs.list();
  }

  @Get(':designId')
  get(
    @Param(new ZodValidationPipe(designParamsSchema, 'params')) params: DesignParams,
  ): GetDesignResponse {
    return this.designs.get(params.designId);
  }
}

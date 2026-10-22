import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  designParamsSchema,
  type DesignParams,
  type GetDesignResponse,
  type ListDesignsResponse,
} from '@athar/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { DesignsService } from './designs.service.js';

/**
 * The design library, `/api/v1/designs`. The same for every account (no
 * ownership), but behind a session like the rest of the app.
 */
@Controller('designs')
@UseGuards(SessionGuard)
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

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  jobCommandRequestSchema,
  jobParamsSchema,
  type DrawingJob,
  type JobParams,
} from '@athar/contracts';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { JobsService } from './jobs.service.js';

/**
 * A command's body must be an object, which an empty request is: a request with no
 * body at all counts as `{}`, and unknown keys are stripped like everywhere else.
 */
const commandBodySchema = z.preprocess((body) => body ?? {}, jobCommandRequestSchema);

/**
 * One job: `/api/v1/jobs/:jobId`. Reads have no side effects; the commands answer
 * with the updated job.
 */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':jobId')
  get(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
  ): Promise<DrawingJob> {
    return this.jobs.get(params.jobId);
  }

  @Post(':jobId/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Body(new ZodValidationPipe(commandBodySchema)) _body: unknown,
  ): Promise<DrawingJob> {
    return this.jobs.pause(params.jobId);
  }

  @Post(':jobId/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Body(new ZodValidationPipe(commandBodySchema)) _body: unknown,
  ): Promise<DrawingJob> {
    return this.jobs.resume(params.jobId);
  }

  @Post(':jobId/stop')
  @HttpCode(HttpStatus.OK)
  stop(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Body(new ZodValidationPipe(commandBodySchema)) _body: unknown,
  ): Promise<DrawingJob> {
    return this.jobs.stop(params.jobId);
  }
}

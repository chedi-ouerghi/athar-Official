import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  jobCommandRequestSchema,
  jobParamsSchema,
  type AuthAccount,
  type DrawingJob,
  type JobParams,
} from '@athar/contracts';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { DomainException } from '../common/http/domain.exception.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { TableRegistry, type TableUse } from '../tables/table-registry.service.js';
import { JobsService } from './jobs.service.js';

/**
 * A command's body must be an object, which an empty request is: a request with no
 * body at all counts as `{}`, and unknown keys are stripped like everywhere else.
 */
const commandBodySchema = z.preprocess((body) => body ?? {}, jobCommandRequestSchema);

/**
 * One job: `/api/v1/jobs/:jobId`. Reads have no side effects; the commands answer
 * with the updated job.
 *
 * Needs a session. The job's table decides who may see it: its owner, or an
 * admin to read; only the owner may command it. Anyone else gets
 * `JOB_NOT_FOUND`, exactly as for a job that does not exist.
 */
@Controller('jobs')
@UseGuards(SessionGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly tables: TableRegistry,
  ) {}

  @Get(':jobId')
  get(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<DrawingJob> {
    return this.visible(params.jobId, request.auth.account, 'read');
  }

  @Post(':jobId/pause')
  @HttpCode(HttpStatus.OK)
  async pause(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Body(new ZodValidationPipe(commandBodySchema)) _body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DrawingJob> {
    await this.visible(params.jobId, request.auth.account, 'command');
    return this.jobs.pause(params.jobId, request.auth);
  }

  @Post(':jobId/resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Body(new ZodValidationPipe(commandBodySchema)) _body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DrawingJob> {
    await this.visible(params.jobId, request.auth.account, 'command');
    return this.jobs.resume(params.jobId, request.auth);
  }

  @Post(':jobId/stop')
  @HttpCode(HttpStatus.OK)
  async stop(
    @Param(new ZodValidationPipe(jobParamsSchema, 'params')) params: JobParams,
    @Body(new ZodValidationPipe(commandBodySchema)) _body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DrawingJob> {
    await this.visible(params.jobId, request.auth.account, 'command');
    return this.jobs.stop(params.jobId, request.auth);
  }

  /** @throws DomainException `JOB_NOT_FOUND` for a missing job, or one on a table `account` may not use. */
  private async visible(jobId: string, account: AuthAccount, use: TableUse): Promise<DrawingJob> {
    const job = await this.jobs.get(jobId);

    try {
      await this.tables.getFor(job.tableId, account, use);
    } catch (error) {
      if (error instanceof DomainException && error.code === 'TABLE_NOT_FOUND') {
        throw new DomainException('JOB_NOT_FOUND', `No job with id ${jobId}.`);
      }

      throw error;
    }

    return job;
  }
}

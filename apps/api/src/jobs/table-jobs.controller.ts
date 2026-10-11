import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import {
  listJobsQuerySchema,
  startJobRequestSchema,
  tableParamsSchema,
  type DrawingJob,
  type ListJobsQuery,
  type ListJobsResponse,
  type StartJobRequest,
  type TableParams,
} from '@athar/contracts';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { JobsService } from './jobs.service.js';

/** Minimal structural view of the Express response. */
interface HttpResponse {
  status(code: number): unknown;
}

/**
 * Jobs of one table: `/api/v1/tables/:tableId/jobs`.
 *
 * Public, like the rest of the table's screen. There is no access control in this
 * milestone, which docs/architecture.md (section 6) states plainly.
 */
@Controller('tables/:tableId/jobs')
export class TableJobsController {
  constructor(private readonly jobs: JobsService) {}

  /**
   * Start a drawing. `201` for a new job, `200` when the request repeats an
   * earlier one and the original job is returned.
   */
  @Post()
  async start(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(startJobRequestSchema)) body: StartJobRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<DrawingJob> {
    const { job, created } = await this.jobs.start(params.tableId, body);

    response.status(created ? 201 : 200);

    return job;
  }

  /** The table's recent jobs, newest first. */
  @Get()
  async list(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Query(new ZodValidationPipe(listJobsQuerySchema, 'query')) query: ListJobsQuery,
  ): Promise<ListJobsResponse> {
    return { jobs: [...(await this.jobs.listForTable(params.tableId, query.limit))] };
  }
}

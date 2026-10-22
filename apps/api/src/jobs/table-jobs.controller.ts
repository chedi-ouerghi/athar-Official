import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
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
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { TableRegistry } from '../tables/table-registry.service.js';
import { JobsService } from './jobs.service.js';

/** Minimal structural view of the Express response. */
interface HttpResponse {
  status(code: number): unknown;
}

/**
 * Jobs of one table: `/api/v1/tables/:tableId/jobs`.
 *
 * Needs a session. Only the table's owner may start a job; the owner or an admin
 * may read the history. Anyone else gets `TABLE_NOT_FOUND`, checked before
 * anything else, so it never reveals whether the table exists.
 */
@Controller('tables/:tableId/jobs')
@UseGuards(SessionGuard)
export class TableJobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly tables: TableRegistry,
  ) {}

  /**
   * Start a drawing. `201` for a new job, `200` when the request repeats an
   * earlier one and the original job is returned.
   */
  @Post()
  async start(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(startJobRequestSchema)) body: StartJobRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<DrawingJob> {
    // Ownership and the drawing conditions are checked by the service, under its lock.
    const { job, created } = await this.jobs.start(params.tableId, body, request.auth);

    response.status(created ? 201 : 200);

    return job;
  }

  /** The table's recent jobs, newest first. */
  @Get()
  async list(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Query(new ZodValidationPipe(listJobsQuerySchema, 'query')) query: ListJobsQuery,
    @Req() request: AuthenticatedRequest,
  ): Promise<ListJobsResponse> {
    await this.tables.getFor(params.tableId, request.auth.account);

    return { jobs: [...(await this.jobs.listForTable(params.tableId, query.limit))] };
  }
}

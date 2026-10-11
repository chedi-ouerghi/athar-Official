import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createTableRequestSchema,
  tableParamsSchema,
  updateTableRequestSchema,
  type AdminTable,
  type ListAdminTablesResponse,
  type TableParams,
  type TableQrResponse,
  type UpdateTableRequest,
} from '@athar/contracts';
import type { z } from 'zod';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AdminKeyGuard } from './admin-key.guard.js';
import { TableRegistry } from './table-registry.service.js';

/**
 * Table provisioning, `/api/v1/admin/tables`.
 *
 * The guard is on the class, so a route added here is protected unless someone
 * deliberately moves it out. It runs before validation: an unauthenticated
 * caller learns nothing about what a valid request looks like.
 */
@Controller('admin/tables')
@UseGuards(AdminKeyGuard)
export class AdminTablesController {
  constructor(private readonly registry: TableRegistry) {}

  /** Register a table. The server generates the id; the caller cannot choose it. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createTableRequestSchema))
    body: z.output<typeof createTableRequestSchema>,
  ): Promise<AdminTable> {
    return this.registry.create(body);
  }

  @Get()
  async list(): Promise<ListAdminTablesResponse> {
    return { tables: [...(await this.registry.list())] };
  }

  @Get(':tableId')
  get(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
  ): Promise<AdminTable> {
    return this.registry.get(params.tableId);
  }

  @Patch(':tableId')
  update(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(updateTableRequestSchema)) body: UpdateTableRequest,
  ): Promise<AdminTable> {
    return this.registry.update(params.tableId, body);
  }

  /** The link the table's QR code encodes, for a future admin UI to render. */
  @Get(':tableId/qr')
  async qr(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
  ): Promise<TableQrResponse> {
    return { tableId: params.tableId, link: await this.registry.linkFor(params.tableId) };
  }
}

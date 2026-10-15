import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { tableParamsSchema, type Table, type TableParams } from '@athar/contracts';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { TablesService } from './tables.service.js';

/**
 * A table as its owner sees it, `/api/v1/tables`.
 *
 * The id arrives from a QR code, which identifies the table but never
 * authorises (decision D1): a session is required, and only the table's owner
 * (or an admin) gets it. Anyone else gets `TABLE_NOT_FOUND`.
 */
@Controller('tables')
@UseGuards(SessionGuard)
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get(':tableId')
  get(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<Table> {
    return this.tables.getTableFor(params.tableId, request.auth.account);
  }
}

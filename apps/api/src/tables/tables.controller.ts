import { Controller, Get, Param } from '@nestjs/common';
import { tableParamsSchema, type Table, type TableParams } from '@athar/contracts';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { TablesService } from './tables.service.js';

/**
 * Public view of a table, `/api/v1/tables`.
 *
 * No authentication: a table id arrives from a QR code, which is not proof of
 * authorisation (docs/architecture.md, section 6).
 */
@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get(':tableId')
  get(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
  ): Promise<Table> {
    return this.tables.getTable(params.tableId);
  }
}

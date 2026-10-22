import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  setAmbienceRequestSchema,
  setLightRequestSchema,
  tableParamsSchema,
  type Pairing,
  type SetAmbienceRequest,
  type SetLightRequest,
  type Table,
  type TableParams,
} from '@athar/contracts';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { PairingStore } from './pairing-store.js';
import { TableRegistry } from './table-registry.service.js';
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
  constructor(
    private readonly tables: TablesService,
    private readonly registry: TableRegistry,
    private readonly pairings: PairingStore,
  ) {}

  @Get(':tableId')
  get(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<Table> {
    return this.tables.getTableFor(params.tableId, request.auth);
  }

  /** Pair this session with the table, or extend its pairing (D9). Owner only; always `200`. */
  @Post(':tableId/pairing')
  @HttpCode(HttpStatus.OK)
  async pair(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<Pairing> {
    await this.registry.getFor(params.tableId, request.auth.account, 'command');

    return this.pairings.pair(request.auth.sessionId, params.tableId);
  }

  /** Show an LED ambience (`ledAmbiences` feature). Owner, paired, online; returns the table. */
  @Put(':tableId/ambience')
  setAmbience(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(setAmbienceRequestSchema)) body: SetAmbienceRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<Table> {
    return this.tables.setAmbience(params.tableId, body.ambienceId, request.auth);
  }

  /**
   * Set the light: off, on, a colour or a named ambience (`ledAmbiences` feature).
   * Owner or guest, paired, online; returns the table.
   */
  @Put(':tableId/light')
  setLight(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(setLightRequestSchema)) body: SetLightRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<Table> {
    return this.tables.setLight(params.tableId, body, request.auth);
  }

  /** End this session's pairing with the table. Owner only; `204` even if there was none. */
  @Delete(':tableId/pairing')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unpair(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.registry.getFor(params.tableId, request.auth.account, 'command');
    this.pairings.unpair(request.auth.sessionId, params.tableId);
  }
}

import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createTableRequestSchema,
  provisionTableRequestSchema,
  tableParamsSchema,
  updateTableRequestSchema,
  type AdminTable,
  type ClaimTokenResponse,
  type ListAdminTablesResponse,
  type ProvisionTableResponse,
  type TableParams,
  type TableQrResponse,
  type UpdateTableRequest,
} from '@athar/contracts';
import type { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { newMqttCredentials } from '../access/mqtt-credentials.js';
import { CustomersService } from '../auth/customers.service.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { SessionGuard, Roles } from '../auth/session.guard.js';
import { DomainException } from '../common/http/domain.exception.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { TableRegistry } from './table-registry.service.js';

/**
 * Table provisioning, `/api/v1/admin/tables`.
 *
 * The guard and the role are on the class, so a route added here is admin-only
 * unless someone deliberately moves it out. The guard runs before validation:
 * an unauthenticated caller learns nothing about what a valid request looks like.
 */
@Controller('admin/tables')
@UseGuards(SessionGuard)
@Roles('admin')
export class AdminTablesController {
  constructor(
    private readonly registry: TableRegistry,
    private readonly customers: CustomersService,
    private readonly access: AccessService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'mqtt'>,
  ) {}

  /**
   * Register a table nobody owns yet, in one step: the table, the broker login
   * for its controller, and the claim code its customer scans. The login and the
   * code are shown here once; the server keeps only the code's hash.
   */
  @Post('provision')
  async provision(
    @Body(new ZodValidationPipe(provisionTableRequestSchema))
    body: z.output<typeof provisionTableRequestSchema>,
  ): Promise<ProvisionTableResponse> {
    const table = await this.registry.create(body);

    return {
      table,
      mqtt: newMqttCredentials(table.id, this.config.mqtt.url),
      pairing: await this.access.issueClaim(table.id),
    };
  }

  /**
   * A new claim code for a table nobody owns yet, for a printed code that expired
   * in stock. The earlier code stops working.
   */
  @Post(':tableId/claim-token')
  async claimToken(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
  ): Promise<ClaimTokenResponse> {
    return { tableId: params.tableId, pairing: await this.access.issueClaim(params.tableId) };
  }

  /** Register a table. The server generates the id; the caller cannot choose it. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createTableRequestSchema))
    body: z.output<typeof createTableRequestSchema>,
  ): Promise<AdminTable> {
    await this.checkOwner(body.ownerAccountId);

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
  async update(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(updateTableRequestSchema)) body: UpdateTableRequest,
  ): Promise<AdminTable> {
    await this.checkOwner(body.ownerAccountId);

    return this.registry.update(params.tableId, body);
  }

  /** The link the table's QR code encodes, for a future admin UI to render. */
  @Get(':tableId/qr')
  async qr(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
  ): Promise<TableQrResponse> {
    return { tableId: params.tableId, link: await this.registry.linkFor(params.tableId) };
  }

  /**
   * A table's owner must be an existing, non-disabled customer. Anything else
   * is the caller's mistake, so `VALIDATION_FAILED` on `body.ownerAccountId`.
   */
  private async checkOwner(ownerAccountId: string | null | undefined): Promise<void> {
    if (
      ownerAccountId !== null &&
      ownerAccountId !== undefined &&
      !(await this.customers.isAssignableOwner(ownerAccountId))
    ) {
      throw new DomainException(
        'VALIDATION_FAILED',
        'ownerAccountId must be the id of an existing, non-disabled customer account.',
      );
    }
  }
}

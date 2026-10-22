import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  claimTokenRequestSchema,
  createTableRequestSchema,
  provisionTableRequestSchema,
  tableParamsSchema,
  updateTableRequestSchema,
  type AdminTable,
  type ClaimTokenRequest,
  type ClaimTokenResponse,
  type ListAdminTablesResponse,
  type ProvisionTableResponse,
  type TableParams,
  type TableQrResponse,
  type UpdateTableRequest,
} from '@athar/contracts';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { newMqttCredentials } from '../access/mqtt-credentials.js';
import { CustomersService } from '../auth/customers.service.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { SessionGuard, Roles } from '../auth/session.guard.js';
import { DomainException } from '../common/http/domain.exception.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { TableRegistry } from './table-registry.service.js';

/** A request with no body at all counts as `{}`: the customer then comes from the table. */
const claimTokenBodySchema = z.preprocess((body) => body ?? {}, claimTokenRequestSchema);

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
    const { customerAccountId, ...fields } = body;
    await this.checkCustomer(customerAccountId, 'customerAccountId');

    const table = await this.registry.create({
      ...fields,
      reservedForAccountId: customerAccountId,
    });

    return {
      table,
      mqtt: newMqttCredentials(table.id, this.config.mqtt.url),
      pairing: await this.access.issueClaim(table.id, customerAccountId),
    };
  }

  /**
   * A new claim code for a table nobody owns yet, for a printed code that expired
   * in stock. The earlier code stops working. It is for the customer the table was
   * provisioned for, unless the body names another one (and a table made before codes
   * were bound to a customer must).
   */
  @Post(':tableId/claim-token')
  async claimToken(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(claimTokenBodySchema)) body: ClaimTokenRequest,
  ): Promise<ClaimTokenResponse> {
    const table = await this.registry.get(params.tableId);
    const customerAccountId = body.customerAccountId ?? table.reservedForAccountId ?? undefined;

    if (customerAccountId === undefined) {
      throw new DomainException(
        'VALIDATION_FAILED',
        'customerAccountId is required: this table was not provisioned for a customer.',
      );
    }

    await this.checkCustomer(customerAccountId, 'customerAccountId');

    return {
      tableId: params.tableId,
      pairing: await this.access.issueClaim(params.tableId, customerAccountId),
    };
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
    if (ownerAccountId !== null && ownerAccountId !== undefined) {
      await this.checkCustomer(ownerAccountId, 'ownerAccountId');
    }
  }

  /** `field` must be the id of an existing, non-disabled customer account. */
  private async checkCustomer(accountId: string, field: string): Promise<void> {
    if (!(await this.customers.isAssignableOwner(accountId))) {
      throw new DomainException(
        'VALIDATION_FAILED',
        `${field} must be the id of an existing, non-disabled customer account.`,
      );
    }
  }
}

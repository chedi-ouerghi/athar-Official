import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  createCustomerRequestSchema,
  customerParamsSchema,
  type AdminCustomer,
  type CreateCustomerRequest,
  type CustomerAccessResponse,
  type CustomerParams,
  type ListCustomersResponse,
} from '@athar/contracts';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { CustomersService } from './customers.service.js';
import { Roles, SessionGuard } from './session.guard.js';

/**
 * Customer accounts, `/api/v1/admin/customers`. Admin-only for every route, as
 * for the admin tables: the guard and the role are on the class.
 */
@Controller('admin/customers')
@UseGuards(SessionGuard)
@Roles('admin')
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** `201` with the one-time activation code. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createCustomerRequestSchema)) body: CreateCustomerRequest,
  ): Promise<CustomerAccessResponse> {
    return this.customers.create(body);
  }

  @Get()
  async list(): Promise<ListCustomersResponse> {
    return { customers: await this.customers.list() };
  }

  /** Ends every session and issues a new one-time activation code. */
  @Post(':accountId/reset-access')
  @HttpCode(200)
  resetAccess(
    @Param(new ZodValidationPipe(customerParamsSchema, 'params')) params: CustomerParams,
  ): Promise<CustomerAccessResponse> {
    return this.customers.resetAccess(params.accountId);
  }

  @Post(':accountId/disable')
  @HttpCode(200)
  disable(
    @Param(new ZodValidationPipe(customerParamsSchema, 'params')) params: CustomerParams,
  ): Promise<AdminCustomer> {
    return this.customers.disable(params.accountId);
  }
}

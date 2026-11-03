import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  createAdminRequestSchema,
  type CreateAdminRequest,
  type CreateAdminResponse,
} from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AccountAlreadyExistsError } from './account.repository.js';
import { AccountsService } from './accounts.service.js';
import { Roles, SessionGuard } from './session.guard.js';

/** Administrator accounts, created only by an authenticated administrator. */
@Controller('admin/admins')
@UseGuards(SessionGuard)
@Roles('admin')
export class AdminAdminsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createAdminRequestSchema)) body: CreateAdminRequest,
  ): Promise<CreateAdminResponse> {
    try {
      return await this.accounts.createAdmin(body);
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) {
        throw new DomainException('ACCOUNT_EXISTS', error.message);
      }

      throw error;
    }
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createShareRequestSchema,
  pairTableRequestSchema,
  tableParamsSchema,
  type CreateShareRequest,
  type CreateShareResponse,
  type PairTableRequest,
  type PairTableResponse,
  type TableParams,
} from '@athar/contracts';
import { Roles, SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AccessService } from './access.service.js';

/**
 * Claiming and sharing a table, `/api/v1/tables`, for customers.
 *
 * What a QR code or a shared link holds is a token the customer's app sends
 * here: seeing a link grants nothing, redeeming it with a session does.
 */
@Controller('tables')
@UseGuards(SessionGuard)
@Roles('customer')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  /** Claim a table with its code (owner), or join one with a shared link (guest). */
  @Post('pair')
  @HttpCode(HttpStatus.OK)
  pair(
    @Body(new ZodValidationPipe(pairTableRequestSchema)) body: PairTableRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<PairTableResponse> {
    return this.access.redeem(request.auth, body);
  }

  /** Invite others to use the table, with a link that expires. Owner only. */
  @Post(':tableId/shares')
  share(
    @Param(new ZodValidationPipe(tableParamsSchema, 'params')) params: TableParams,
    @Body(new ZodValidationPipe(createShareRequestSchema)) body: CreateShareRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<CreateShareResponse> {
    return this.access.createShare(params.tableId, request.auth, body);
  }
}

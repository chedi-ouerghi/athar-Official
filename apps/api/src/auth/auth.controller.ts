import { Body, Controller, Get, HttpCode, Ip, Post, Req, UseGuards } from '@nestjs/common';
import {
  activateRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  type ActivateRequest,
  type LoginRequest,
  type MeResponse,
  type RefreshRequest,
  type SessionResponse,
} from '@athar/contracts';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { SessionGuard, type AuthenticatedRequest } from './session.guard.js';

/** Sign-in and sessions, `/api/v1/auth`. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Ip() ip: string,
  ): Promise<SessionResponse> {
    return this.auth.login(body, ip);
  }

  @Post('activate')
  @HttpCode(200)
  activate(
    @Body(new ZodValidationPipe(activateRequestSchema)) body: ActivateRequest,
    @Ip() ip: string,
  ): Promise<SessionResponse> {
    return this.auth.activate(body, ip);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
  ): Promise<SessionResponse> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  logout(@Req() request: AuthenticatedRequest): Promise<void> {
    return this.auth.logout(request.auth.sessionId);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest): MeResponse {
    return request.auth.account;
  }
}

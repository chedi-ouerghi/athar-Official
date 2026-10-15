/**
 * Requires a session: `Authorization: Bearer <accessToken>`, and nowhere else,
 * so a token cannot land in a URL or an access log.
 *
 * - No token, or one the server does not know: `401 UNAUTHORIZED`.
 * - A known token that has expired or been revoked: `401 SESSION_EXPIRED`.
 * - Both carry `WWW-Authenticate: Bearer` and never echo the token.
 * - A valid session whose role is not in `@Roles(...)`: `403 FORBIDDEN`.
 *
 * On success the request carries `auth` ({@link Authenticated}).
 */

import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccountRole } from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import { AuthService, UNAUTHORIZED_MESSAGE, type Authenticated } from './auth.service.js';

const ROLES_KEY = 'athar:roles';

/** Only these roles may call the route (or every route of the controller). */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);

/** A request that went through {@link SessionGuard}. */
export interface AuthenticatedRequest {
  auth: Authenticated;
}

/** Minimal structural view of the parts of the Express objects the guard uses. */
interface GuardRequest {
  readonly headers?: Record<string, string | string[] | undefined>;
  auth?: Authenticated;
}

interface GuardResponse {
  setHeader(name: string, value: string): unknown;
}

const BEARER = /^Bearer[ \t]+(\S+)$/i;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<GuardRequest>();
    const header = request.headers?.authorization;
    const supplied = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;

    try {
      if (supplied === undefined) {
        throw new DomainException('UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
      }

      request.auth = await this.auth.authenticate(supplied);
    } catch (error) {
      http.getResponse<GuardResponse>().setHeader('WWW-Authenticate', 'Bearer');
      throw error;
    }

    const roles = this.reflector.getAllAndOverride<AccountRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (roles !== undefined && !roles.includes(request.auth.account.role)) {
      throw new DomainException('FORBIDDEN', 'This account may not do that.');
    }

    return true;
  }
}

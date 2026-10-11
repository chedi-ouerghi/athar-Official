/**
 * Protects the admin endpoints with `ADMIN_API_KEY`.
 *
 * - The key arrives as `Authorization: Bearer <key>` and nowhere else, so it
 *   cannot land in a URL, an access log or the exception filter's
 *   `METHOD url` line.
 * - It is compared in constant time: both sides are hashed with SHA-256, which
 *   gives two buffers of equal length, and the digests are compared with
 *   `timingSafeEqual`. Neither the time taken nor an early length check reveals
 *   how much of the key was right.
 * - Every failure is **the same response**: a missing header, a header that is
 *   not `Bearer`, a wrong key, and a server with no key configured all give
 *   `401 UNAUTHORIZED` with one generic message and `WWW-Authenticate: Bearer`.
 *   The response never says which of them happened.
 * - With no key configured (development and test only) it **fails closed**:
 *   nobody gets in.
 */

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DomainException } from '../common/http/domain.exception.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/** The one message every authentication failure carries. */
export const UNAUTHORIZED_MESSAGE = 'Authentication is required.';

/** Minimal structural view of the parts of the Express objects the guard uses. */
interface GuardRequest {
  readonly headers?: Record<string, string | string[] | undefined>;
}

interface GuardResponse {
  setHeader(name: string, value: string): unknown;
}

const BEARER = /^Bearer[ \t]+(\S+)$/i;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'adminApiKey'>) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<GuardRequest>();
    const response = http.getResponse<GuardResponse>();

    if (!this.isAuthorised(request.headers?.authorization)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw new DomainException('UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }

    return true;
  }

  private isAuthorised(header: string | string[] | undefined): boolean {
    const expected = this.config.adminApiKey;
    const supplied = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;

    // The comparison always runs, against a fixed value when there is nothing to
    // compare, so a missing key or header costs the same as a wrong one.
    const matches = timingSafeEqual(digest(supplied ?? ''), digest(expected ?? ''));

    return expected !== undefined && supplied !== undefined && matches;
  }
}

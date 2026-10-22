/**
 * Claiming a table and sharing it.
 *
 * - An admin **provisions** a table nobody owns, for one named customer, and gets
 *   a one-time claim token (printed in its QR code; 30 days, replaceable while the
 *   table is unclaimed). The token is bound to that table and that customer's
 *   account.
 * - That customer scans it and **claims** the table: the token is spent and the
 *   account becomes the owner (`ownerAccountId`). Another account scanning it is
 *   refused (`PAIRING_WRONG_ACCOUNT`) and nothing is spent.
 * - The owner **shares** the table with a link; whoever follows it becomes a
 *   guest until the link expires. A guest may read and command the table, never
 *   share it.
 *
 * A token is 256 random bits shown once; only its SHA-256 is stored. Whether it
 * is unknown, expired, used up, revoked or for another table, the answer is the
 * same (`PAIRING_TOKEN_INVALID`), so a caller learns nothing about which tokens
 * exist. Tokens never appear in logs.
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ClaimToken,
  CreateShareRequest,
  CreateShareResponse,
  PairTableRequest,
  PairTableResponse,
} from '@athar/contracts';
import type { Authenticated } from '../auth/auth.service.js';
import { newToken, sha256 } from '../auth/token.js';
import { DomainException } from '../common/http/domain.exception.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { CLOCK, type Clock } from '../device/clock.js';
import type { TableRecord } from '../tables/table-repository.js';
import { TableRegistry } from '../tables/table-registry.service.js';
import { TableAccessRepository } from './access.repository.js';
import { buildPairingLink } from './pairing-links.js';

/** How long a table's claim code works: it may sit in stock for weeks. */
export const CLAIM_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

const HOUR_MS = 3_600_000;

const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

const invalidToken = () =>
  new DomainException('PAIRING_TOKEN_INVALID', 'This code or link is not valid any more.');

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly repository: TableAccessRepository,
    private readonly registry: TableRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'publicLinkBaseUrl'>,
  ) {}

  /**
   * A new claim token for a table nobody owns, replacing any earlier one (which
   * stops working). Admin only, by the controller.
   *
   * @throws DomainException `TABLE_NOT_FOUND`, `TABLE_ALREADY_CLAIMED`
   */
  async issueClaim(tableId: string, accountId: string): Promise<ClaimToken> {
    const table = await this.registry.get(tableId);

    if (table.ownerAccountId !== null) {
      throw alreadyClaimed(tableId);
    }

    // The table remembers who it is for, so a replacement code (the printed one
    // expired in stock) is for the same customer without asking again.
    if (table.reservedForAccountId !== accountId) {
      await this.registry.update(tableId, { reservedForAccountId: accountId });
    }

    const now = this.clock.now();
    const token = newToken();
    const expiresAt = iso(now + CLAIM_TOKEN_TTL_MS);

    await this.repository.revokeClaims(tableId, iso(now));
    await this.repository.insertToken(
      {
        kind: 'claim',
        id: randomUUID(),
        tableId,
        tokenHash: sha256(token),
        createdBy: null,
        createdAt: iso(now),
        expiresAt,
        maxUses: 1,
        usedCount: 0,
        revokedAt: null,
        accountId,
      },
      now,
    );
    this.logger.log(`Issued a claim code for table ${tableId}`);

    return {
      ...buildPairingLink(this.config.publicLinkBaseUrl, tableId, token, expiresAt),
      token,
      accountId,
    };
  }

  /**
   * A link that makes whoever follows it a guest of the caller's table, until it
   * expires. Owner only: anyone else gets `TABLE_NOT_FOUND`.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async createShare(
    tableId: string,
    caller: Authenticated,
    request: CreateShareRequest,
  ): Promise<CreateShareResponse> {
    await this.registry.getFor(tableId, caller.account, 'manage');

    const now = this.clock.now();
    const token = newToken();
    const id = randomUUID();
    const expiresAt = iso(now + request.expiresInHours * HOUR_MS);

    await this.repository.insertToken(
      {
        kind: 'share',
        id,
        tableId,
        tokenHash: sha256(token),
        createdBy: caller.account.id,
        createdAt: iso(now),
        expiresAt,
        maxUses: request.maxUses,
        usedCount: 0,
        revokedAt: null,
      },
      now,
    );
    this.logger.log(`Table ${tableId} shared (${id}), up to ${request.maxUses} use(s)`);

    return {
      shareId: id,
      maxUses: request.maxUses,
      ...buildPairingLink(this.config.publicLinkBaseUrl, tableId, token, expiresAt),
    };
  }

  /**
   * Redeem a claim or share token for the signed-in account: the owner of the
   * table with a claim token, a guest with a share token. The owner following a
   * link to their own table is told so and nothing changes.
   *
   * @throws DomainException `PAIRING_TOKEN_INVALID`, `TABLE_ALREADY_CLAIMED`
   */
  async redeem(caller: Authenticated, request: PairTableRequest): Promise<PairTableResponse> {
    const { tableId } = request;
    const accountId = caller.account.id;
    const table = await this.tableOrInvalid(tableId);

    if (table.ownerAccountId === accountId) {
      return { tableId, role: 'owner', expiresAt: null };
    }

    const result = await this.repository.redeem({
      tokenHash: sha256(request.token),
      tableId,
      accountId,
      now: this.clock.now(),
      ownerless: table.ownerAccountId === null,
    });

    switch (result.outcome) {
      case 'invalid':
        throw invalidToken();

      case 'already-claimed':
        throw alreadyClaimed(tableId);

      case 'wrong-account':
        // Said plainly: the code is the customer's own secret, and a customer signed
        // in to the wrong account needs to know to switch rather than to ask for a new one.
        throw new DomainException(
          'PAIRING_WRONG_ACCOUNT',
          'This code was issued for another account. Sign in with the account it was made for.',
        );

      case 'guest':
        this.logger.log(`Table ${tableId} joined by a guest`);

        return { tableId, role: 'guest', expiresAt: result.expiresAt };

      case 'claimed':
        try {
          await this.registry.update(tableId, { ownerAccountId: accountId });
        } catch (error) {
          // The code was spent but the table was not assigned: give the use back.
          await this.repository.refund(result.tokenId);
          throw error;
        }

        this.logger.log(`Table ${tableId} claimed`);

        return { tableId, role: 'owner', expiresAt: null };
    }
  }

  /** An unknown table is as invalid as an unknown token: it must not be probeable. */
  private async tableOrInvalid(tableId: string): Promise<TableRecord> {
    try {
      return await this.registry.get(tableId);
    } catch (error) {
      if (error instanceof DomainException && error.code === 'TABLE_NOT_FOUND') {
        throw invalidToken();
      }

      throw error;
    }
  }
}

const alreadyClaimed = (tableId: string) =>
  new DomainException('TABLE_ALREADY_CLAIMED', `Table ${tableId} already has an owner.`);

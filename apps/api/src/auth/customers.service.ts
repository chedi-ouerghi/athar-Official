import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminCustomer, CustomerAccessResponse } from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import { CLOCK, type Clock } from '../device/clock.js';
import {
  AccountAlreadyExistsError,
  AccountRepository,
  type AccountRecord,
} from './account.repository.js';
import { ACTIVATION_TTL_MS, AccountsService, toAuthAccount } from './accounts.service.js';
import { AuthService } from './auth.service.js';
import { newActivationCode, sha256 } from './token.js';

/** An admin's view of a customer: never a hash. */
export function toAdminCustomer(account: AccountRecord): AdminCustomer {
  return {
    ...toAuthAccount(account),
    status: account.disabled
      ? 'disabled'
      : account.passwordHash === null
        ? 'pending-activation'
        : 'active',
    createdAt: account.createdAt,
  };
}

const customerNotFound = (accountId: string) =>
  new DomainException('NOT_FOUND', `No customer with id ${accountId}.`);

/**
 * What an admin does with customer accounts (decision D7): create them, list
 * them, reset their access and disable them. Activation codes are returned once
 * and stored only as hashes; they are never logged.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly accounts: AccountRepository,
    private readonly creator: AccountsService,
    private readonly auth: AuthService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** @throws DomainException `ACCOUNT_EXISTS` if the email is taken (by any account). */
  async create(input: { email: string; displayName: string }): Promise<CustomerAccessResponse> {
    try {
      const { account, activationCode } = await this.creator.createCustomer(input);

      return { account: await this.customer(account.id), activationCode };
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) {
        throw new DomainException('ACCOUNT_EXISTS', error.message);
      }

      throw error;
    }
  }

  /** Every customer, oldest first. */
  async list(): Promise<AdminCustomer[]> {
    return (await this.accounts.list())
      .filter((account) => account.role === 'customer')
      .map(toAdminCustomer);
  }

  /**
   * Lost password: clear it, issue a new activation code, and end every session.
   * The password goes first, so no new session can start before the revocation.
   * A disabled customer stays disabled.
   *
   * @throws DomainException `NOT_FOUND` for an unknown id or a non-customer.
   */
  async resetAccess(accountId: string): Promise<CustomerAccessResponse> {
    const activationCode = newActivationCode();
    const now = this.clock.now();
    const account = await this.changeCustomer(accountId, (current) => ({
      ...current,
      passwordHash: null,
      activationCodeHash: sha256(activationCode),
      activationExpiresAt: new Date(now + ACTIVATION_TTL_MS).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }));

    await this.auth.revokeAllFor(accountId);
    this.logger.log(`Reset access of customer ${accountId}`);

    return { account: toAdminCustomer(account), activationCode };
  }

  /**
   * Disable a customer and end every session. Their tables keep them as owner.
   *
   * @throws DomainException `NOT_FOUND` for an unknown id or a non-customer.
   */
  async disable(accountId: string): Promise<AdminCustomer> {
    const account = await this.changeCustomer(accountId, (current) => ({
      ...current,
      disabled: true,
      updatedAt: new Date(this.clock.now()).toISOString(),
    }));

    await this.auth.revokeAllFor(accountId);
    this.logger.log(`Disabled customer ${accountId}`);

    return toAdminCustomer(account);
  }

  /**
   * Whether a table may be assigned to this account: it must be an existing,
   * non-disabled customer (an admin owns no tables).
   */
  async isAssignableOwner(accountId: string): Promise<boolean> {
    const account = await this.accounts.get(accountId);

    return account?.role === 'customer' && !account.disabled;
  }

  private async customer(accountId: string): Promise<AdminCustomer> {
    const account = await this.accounts.get(accountId);

    if (account?.role !== 'customer') {
      throw customerNotFound(accountId);
    }

    return toAdminCustomer(account);
  }

  private async changeCustomer(
    accountId: string,
    change: (account: AccountRecord) => AccountRecord,
  ): Promise<AccountRecord> {
    const updated = await this.accounts.update(accountId, (current) =>
      current.role === 'customer' ? change(current) : undefined,
    );

    if (updated === undefined) {
      throw customerNotFound(accountId);
    }

    return updated;
  }
}

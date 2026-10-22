import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { adminPasswordSchema, type AccountRole, type AuthAccount } from '@athar/contracts';
import { CLOCK, type Clock } from '../device/clock.js';
import { AccountRepository, type AccountRecord } from './account.repository.js';
import { hashPassword } from './password-hasher.js';
import { newActivationCode, sha256 } from './token.js';

/** How long an activation code works (decision D7). */
export const ACTIVATION_TTL_MS = 72 * 60 * 60_000;

/** The client's view of an account: never a hash. */
export function toAuthAccount(account: AccountRecord): AuthAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
  };
}

interface NewAccount {
  /** Already validated and lowercased (`emailSchema`). */
  readonly email: string;
  readonly displayName: string;
}

/** Creating accounts. The admin customer endpoints (Phase 3) call this too. */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly accounts: AccountRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * A customer who cannot sign in until they activate with the returned code.
   * The code is returned here once and stored only as a hash.
   *
   * @throws AccountAlreadyExistsError if the email is taken.
   */
  async createCustomer(
    input: NewAccount,
  ): Promise<{ account: AuthAccount; activationCode: string }> {
    const activationCode = newActivationCode();
    const account = await this.create(input, 'customer', {
      passwordHash: null,
      activationCodeHash: sha256(activationCode),
      activationExpiresAt: new Date(this.clock.now() + ACTIVATION_TTL_MS).toISOString(),
    });

    return { account, activationCode };
  }

  /**
   * An admin, active straight away. Only the `admin:create` command calls this.
   *
   * @throws AccountAlreadyExistsError if the email is taken.
   * @throws Error if the password is not 14 to 200 characters.
   */
  async createAdmin(input: NewAccount & { readonly password: string }): Promise<AuthAccount> {
    if (!adminPasswordSchema.safeParse(input.password).success) {
      throw new Error('An admin password needs 14 to 200 characters.');
    }

    return this.create(input, 'admin', {
      passwordHash: await hashPassword(input.password),
      activationCodeHash: null,
      activationExpiresAt: null,
    });
  }

  private async create(
    input: NewAccount,
    role: AccountRole,
    secrets: Pick<AccountRecord, 'passwordHash' | 'activationCodeHash' | 'activationExpiresAt'>,
  ): Promise<AuthAccount> {
    const now = new Date(this.clock.now()).toISOString();
    const record: AccountRecord = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      role,
      ...secrets,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.accounts.create(record);
    this.logger.log(`Created ${role} account ${record.id}`);

    return toAuthAccount(record);
  }
}

import { Logger } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountRepository } from '../auth/account.repository.js';
import { verifyPassword } from '../auth/password-hasher.js';
import type { CliIo } from './cli-io.js';
import { ADMIN_CREATE_USAGE, parseAdminCreateArguments, runAdminCreate } from './admin-create.js';

const PASSWORD = 'a-long-enough-password';

function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];

  return { io: { out: (text) => out.push(text), err: (text) => err.push(text) }, out, err };
}

describe('parseAdminCreateArguments', () => {
  it('reads and normalises the email and name', () => {
    expect(
      parseAdminCreateArguments(['--email', ' Boss@Athar.Test ', '--name', ' Boss ']),
    ).toStrictEqual({ email: 'boss@athar.test', displayName: 'Boss', passwordStdin: false });
  });

  it('reads --password-stdin', () => {
    expect(
      parseAdminCreateArguments(['--email', 'a@b.co', '--name', 'A', '--password-stdin'])
        .passwordStdin,
    ).toBe(true);
  });

  it.each([
    ['no arguments', [], /--email/],
    ['an invalid email', ['--email', 'nope', '--name', 'A'], /--email/],
    ['a blank name', ['--email', 'a@b.co', '--name', '  '], /--name/],
    ['an unknown option', ['--email', 'a@b.co', '--name', 'A', '--x'], /Unknown option --x/],
  ])('rejects %s', (_label, argv, message) => {
    expect(() => parseAdminCreateArguments(argv)).toThrow(message);
  });

  it.each([
    ['--password', 'hunter2-hunter2'],
    ['--password=hunter2-hunter2', undefined],
  ])('never takes the password as an argument (%s), and never repeats it', (option, value) => {
    const argv = ['--email', 'a@b.co', '--name', 'A', option, ...(value ? [value] : [])];

    expect(() => parseAdminCreateArguments(argv)).toThrow(/never taken as an argument/);
    expect(() => parseAdminCreateArguments(argv)).not.toThrow(/hunter2/);
  });
});

describe('runAdminCreate', () => {
  let directory: string;
  let file: string;
  const config = () => ({ accountsDataFile: file });

  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'athar-admin-'));
    file = join(directory, 'data', 'accounts.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const run = (argv: string[], password = PASSWORD) => {
    const output = capture();
    const reads: boolean[] = [];

    return runAdminCreate(argv, {
      config: config(),
      io: output.io,
      readPassword: (fromStdin) => {
        reads.push(fromStdin);
        return Promise.resolve(password);
      },
    }).then((code) => ({ code, ...output, reads }));
  };

  it('creates an active admin in the accounts file, storing only a hash', async () => {
    const { code, out, reads } = await run(['--email', 'boss@athar.test', '--name', 'Boss']);

    expect(code).toBe(0);
    expect(reads).toStrictEqual([false]);
    expect(out[0]).toMatch(/^Created admin boss@athar\.test \(/);

    const text = await readFile(file, 'utf8');
    expect(text).not.toContain(PASSWORD);

    const repository = await AccountRepository.open(file);
    try {
      const admin = await repository.findByEmail('boss@athar.test');
      expect(admin).toMatchObject({ role: 'admin', displayName: 'Boss', disabled: false });
      expect(await verifyPassword(PASSWORD, admin?.passwordHash ?? '')).toBe(true);
    } finally {
      await repository.close();
    }
  });

  it('asks the password source for stdin with --password-stdin', async () => {
    const { reads } = await run(['--email', 'a@b.co', '--name', 'A', '--password-stdin']);

    expect(reads).toStrictEqual([true]);
  });

  it('refuses an admin password shorter than 14 characters, and creates nothing', async () => {
    const { code, err } = await run(['--email', 'a@b.co', '--name', 'A'], 'x'.repeat(13));

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('14 to 200 characters');
    expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({ version: 1, accounts: [] });
  });

  it('refuses an email that is already taken', async () => {
    await run(['--email', 'a@b.co', '--name', 'A']);

    const { code, err } = await run(['--email', 'A@B.CO', '--name', 'Again']);

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('already exists');
  });

  it('exits 2 and prints the usage for a bad call', async () => {
    const { code, err } = await run(['--name', 'A']);

    expect(code).toBe(2);
    expect(err.at(-1)).toBe(ADMIN_CREATE_USAGE);
  });

  it('refuses while another process holds the file for writing, before asking for the password', async () => {
    const running = await AccountRepository.open(file);

    try {
      const { code, err, reads } = await run(['--email', 'a@b.co', '--name', 'A']);

      expect(code).toBe(1);
      expect(err.join('\n')).toContain('open for writing');
      expect(err.join('\n')).toContain('stop the API');
      expect(reads).toStrictEqual([]);
      expect(await running.findByEmail('a@b.co')).toBeUndefined();
    } finally {
      await running.close();
    }
  });

  it('releases the lock when it is done', async () => {
    await run(['--email', 'a@b.co', '--name', 'A']);

    await (await AccountRepository.open(file)).close();
  });
});

/**
 * A list of records persisted in one JSON file, shared by tables, accounts and
 * sessions.
 *
 * ```json
 * { "version": 1, "<key>": [ { ... }, ... ] }
 * ```
 *
 * Guarantees, from docs/architecture.md ("Table persistence: JSON file"):
 *
 * - **Validated on load.** The file is parsed and checked against a Zod schema.
 *   A corrupt file, an unknown version or an invalid record fail startup with a
 *   readable error, and the file is never overwritten.
 * - **Atomic writes.** Each change is written to a temporary file *in the same
 *   directory*, flushed to disk, then renamed over the real file. A crash leaves
 *   the old file or the new one, never half of one. The same directory is what
 *   makes the rename atomic.
 * - **One writer at a time.** Changes run through a queue, and memory is
 *   replaced only after the rename succeeded, so a failed write leaves memory
 *   and disk in agreement.
 * - **One writing process.** A second process writing the file would silently
 *   discard the first one's changes, so a writer holds a lock file
 *   (`<file>.lock`, containing `<pid>:<hostname>`) for as long as it is open. A
 *   lock left on this host by a process that no longer exists is taken over, and
 *   so is one naming this process's own pid that this process does not hold (a
 *   container restarting as PID 1 finds the lock of its previous run). A lock
 *   from another host (a shared volume) cannot be checked, so it is refused. A
 *   lock holding only a pid, from an older build, counts as this host's.
 *   Read-only opens take no lock, and are safe at any time because the file is
 *   only ever replaced atomically.
 *
 * It is a single-instance store: one API process only. Move to a database
 * before running more than one instance.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';
import { StartupConfigurationError } from '../../config/startup-configuration.error.js';

/** The file-system calls the store makes, replaceable so tests can make them fail. */
export interface FileOperations {
  rename(from: string, to: string): Promise<void>;
}

export interface JsonFileStoreOptions<T> {
  /** The environment variable naming the file, for error messages, e.g. `TABLES_DATA_FILE`. */
  readonly setting: string;
  /** The document property holding the records, e.g. `tables`. */
  readonly key: string;
  /** The only file format version this build reads and writes. */
  readonly version: number;
  /** Validates the record list. */
  readonly schema: z.ZodType<T[]>;
  /** The end of the "already open" message: what to do instead. */
  readonly busyHint: string;
  /**
   * Open without taking the lock, creating anything, or ever writing. For tools
   * that only read (the QR command).
   */
  readonly readOnly?: boolean;
  readonly fileOperations?: FileOperations;
}

/** What a change computes: the next list to store (none: store nothing) and what to return. */
export interface Change<T, R> {
  readonly next?: readonly T[];
  readonly result: R;
}

/** The records, in memory or backed by a file. Repositories are written against this. */
export interface RecordStore<T> {
  /** The current list. The same array until a change is stored. */
  readonly records: readonly T[];
  /**
   * Run `compute` on the current list, one change at a time, in order. If it
   * returns a `next` list, that list is stored before the promise resolves. A
   * throw rejects this change only.
   */
  change<R>(compute: (records: readonly T[]) => Change<T, R>): Promise<R>;
  close(): Promise<void>;
}

/** The store for tests: memory only. */
export class MemoryStore<T> implements RecordStore<T> {
  constructor(public records: readonly T[] = []) {}

  change<R>(compute: (records: readonly T[]) => Change<T, R>): Promise<R> {
    try {
      const { next, result } = compute(this.records);

      if (next !== undefined) {
        this.records = next;
      }

      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Owner-only permissions: the files hold password and token hashes. A directory
 * that already exists keeps its mode. POSIX only; Windows ignores these modes.
 */
export const FILE_MODE = 0o600;
export const DIRECTORY_MODE = 0o700;

/** Renames that fail transiently on Windows while another process has the target open. */
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_DELAY_MS = 25;

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return errorCode(error) === 'EPERM';
  }
}

/**
 * Lock files this process holds right now. A lock naming this process's pid
 * that is not in here was left by an earlier process that had the same pid.
 */
const heldLocks = new Set<string>();

/** The key of a lock file in {@link heldLocks}: one spelling per file, even on Windows. */
function lockKey(lockFile: string): string {
  const path = resolve(lockFile);

  return process.platform === 'win32' ? path.toLowerCase() : path;
}

export class JsonFileStore<T> implements RecordStore<T> {
  private readonly fileOperations: FileOperations;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(
    private readonly file: string,
    private readonly options: JsonFileStoreOptions<T>,
    public records: readonly T[],
    private readonly lockFile: string | undefined,
  ) {
    this.fileOperations = options.fileOperations ?? { rename };
  }

  /**
   * Load the file, creating it (and its directory) first if it is missing.
   *
   * @throws StartupConfigurationError if the file is unreadable, invalid, of an
   *   unknown version, or is open for writing in another process.
   */
  static async open<T>(file: string, options: JsonFileStoreOptions<T>): Promise<JsonFileStore<T>> {
    const readOnly = options.readOnly ?? false;
    const lockFile = readOnly ? undefined : `${file}.lock`;
    const unusable = (reason: string) =>
      new StartupConfigurationError(
        `${options.setting} ${file} cannot be used: ${reason}\nThe file has not been modified.`,
      );

    if (lockFile !== undefined) {
      try {
        await mkdir(dirname(file), { recursive: true, mode: DIRECTORY_MODE });
      } catch (error) {
        throw unusable(
          `its directory could not be created (${errorCode(error) ?? 'unknown error'}).`,
        );
      }

      await acquireLock(lockFile, unusable, options.busyHint);
    }

    try {
      if (lockFile !== undefined) {
        await removeLeftoverTemporaryFiles(file);
      }

      const loaded = await load(file, options, unusable);
      const store = new JsonFileStore(file, options, loaded ?? [], lockFile);

      if (loaded === undefined && lockFile !== undefined) {
        await store.persist([]);
      }

      return store;
    } catch (error) {
      if (lockFile !== undefined) {
        await unlink(lockFile).catch(() => undefined);
        heldLocks.delete(lockKey(lockFile));
      }

      throw error;
    }
  }

  /** Wait for pending writes, then release the lock. Safe to call twice. */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.queue.catch(() => undefined);

    if (this.lockFile !== undefined) {
      await unlink(this.lockFile).catch(() => undefined);
      heldLocks.delete(lockKey(this.lockFile));
    }
  }

  change<R>(compute: (records: readonly T[]) => Change<T, R>): Promise<R> {
    if (this.lockFile === undefined) {
      return Promise.reject(new Error(`This ${this.options.key} store was opened read-only.`));
    }

    if (this.closed) {
      return Promise.reject(new Error(`This ${this.options.key} store is closed.`));
    }

    const result = this.queue.then(async () => {
      const { next, result: value } = compute(this.records);

      if (next !== undefined) {
        await this.persist(next);
        this.records = next;
      }

      return value;
    });
    this.queue = result.catch(() => undefined);

    return result;
  }

  /** Write the whole document atomically: temporary file, flush, rename. */
  private async persist(records: readonly T[]): Promise<void> {
    const document =
      JSON.stringify({ version: this.options.version, [this.options.key]: records }, null, 2) +
      '\n';
    const temporary = `${this.file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

    try {
      // The rename keeps this mode, so the data file is owner-only too.
      const handle = await open(temporary, 'w', FILE_MODE);

      try {
        await handle.writeFile(document, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }

      await this.renameWithRetry(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  private async renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.fileOperations.rename(from, to);
        return;
      } catch (error) {
        const code = errorCode(error);

        if (
          attempt >= RENAME_ATTEMPTS ||
          code === undefined ||
          !TRANSIENT_RENAME_ERRORS.has(code)
        ) {
          throw error;
        }

        await sleep(RENAME_RETRY_DELAY_MS * attempt);
      }
    }
  }
}

type Unusable = (reason: string) => StartupConfigurationError;

/** Returns the stored records, or `undefined` if the file does not exist. */
async function load<T>(
  file: string,
  options: JsonFileStoreOptions<T>,
  unusable: Unusable,
): Promise<T[] | undefined> {
  let text: string;

  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return undefined;
    }

    throw unusable(`it could not be read (${errorCode(error) ?? 'unknown error'}).`);
  }

  let json: unknown;

  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw unusable('it is not valid JSON.');
  }

  const version =
    typeof json === 'object' && json !== null ? (json as { version?: unknown }).version : undefined;

  if (typeof version === 'number' && version !== options.version) {
    throw unusable(
      `it has version ${version}, but this build only understands version ${options.version}.`,
    );
  }

  const parsed = z
    .object({ version: z.literal(options.version), records: options.schema })
    .safeParse(
      typeof json === 'object' && json !== null && !Array.isArray(json)
        ? { version, records: (json as Record<string, unknown>)[options.key] }
        : json,
    );

  if (!parsed.success) {
    const reasons = parsed.error.issues
      .slice(0, 5)
      .map((issue) => {
        const [first, ...rest] = issue.path;
        const path = first === 'records' ? [options.key, ...rest] : issue.path;

        return `${path.join('.') || '(root)'}: ${issue.message}`;
      })
      .join('; ');

    throw unusable(`it does not have the expected structure (${reasons}).`);
  }

  return parsed.data.records;
}

/** Delete temporary files a crashed writer left behind. They are never read. */
async function removeLeftoverTemporaryFiles(file: string): Promise<void> {
  const directory = dirname(file);
  const prefix = `${basename(file)}.`;
  const pattern = /^\d+\.[0-9a-f]+\.tmp$/;

  for (const name of await readdir(directory)) {
    if (name.startsWith(prefix) && pattern.test(name.slice(prefix.length))) {
      await unlink(`${directory}/${name}`).catch(() => undefined);
    }
  }
}

/** Take the writer lock, or explain who holds it. */
async function acquireLock(lockFile: string, unusable: Unusable, busyHint: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockFile, 'wx', FILE_MODE);

      try {
        await handle.writeFile(`${process.pid}:${hostname()}`, 'utf8');
      } finally {
        await handle.close();
      }

      heldLocks.add(lockKey(lockFile));
      return;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') {
        throw unusable(
          `the lock file could not be created (${errorCode(error) ?? 'unknown error'}).`,
        );
      }
    }

    // `<pid>:<hostname>`, or a bare pid from an older build, which is this host's.
    const [pidText = '', host = hostname()] = (await readFile(lockFile, 'utf8').catch(() => ''))
      .trim()
      .split(':');
    const holder = Number.parseInt(pidText, 10);

    if (!Number.isInteger(holder) || holder <= 0) {
      throw unusable(
        `its lock file ${lockFile} exists but does not name a process. If no API or command is running, delete the lock file.`,
      );
    }

    if (host !== hostname()) {
      throw unusable(
        `it is open for writing by process ${holder} on host ${host}, which cannot be checked from here. If no API or command is running there, delete the lock file ${lockFile}.`,
      );
    }

    if (
      // Our own pid in a lock we do not hold is left over from an earlier run (PID 1 in a container).
      holder === process.pid ? heldLocks.has(lockKey(lockFile)) : processIsAlive(holder)
    ) {
      throw unusable(`it is open for writing by process ${holder}. ${busyHint}`);
    }

    // The holder is gone: the lock is left over from a crash. Take it over.
    await unlink(lockFile).catch(() => undefined);
  }

  throw unusable(`its lock file ${lockFile} could not be taken over.`);
}

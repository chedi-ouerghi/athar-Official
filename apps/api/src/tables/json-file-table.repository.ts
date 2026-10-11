/**
 * Tables persisted in one JSON file (`TABLES_DATA_FILE`).
 *
 * ```json
 * { "version": 1, "tables": [ { "id": "...", "displayName": "...", ... } ] }
 * ```
 *
 * Guarantees, from docs/architecture.md ("Table persistence: JSON file"):
 *
 * - **Validated on load.** The file is parsed and checked against a Zod schema.
 *   A corrupt file, an unknown version or duplicate ids fail startup with a
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
 *   (`<file>.lock`, containing its pid) for as long as it is open. A lock left
 *   by a process that no longer exists is taken over. Read-only opens take no
 *   lock, and are safe at any time because the file is only ever replaced
 *   atomically.
 *
 * The file holds registration data only: no secrets, no personal data, no jobs.
 * It is a single-instance store; a database is an open decision.
 */

import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { z } from 'zod';
import { adminTableSchema } from '@athar/contracts';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import {
  TableAlreadyExistsError,
  applyPatch,
  type TablePatch,
  type TableRecord,
  type TableRepository,
} from './table-repository.js';

/** The only file format version this build reads and writes. */
export const TABLES_FILE_VERSION = 1;

const tablesFileSchema = z
  .object({
    version: z.literal(TABLES_FILE_VERSION),
    tables: z.array(adminTableSchema),
  })
  .superRefine((file, context) => {
    const seen = new Set<string>();

    for (const [index, table] of file.tables.entries()) {
      if (seen.has(table.id)) {
        context.addIssue({
          code: 'custom',
          path: ['tables', index, 'id'],
          message: `duplicate table id ${table.id}`,
        });
      }

      seen.add(table.id);
    }
  });

/** The file-system calls the repository makes, replaceable so tests can make them fail. */
export interface FileOperations {
  rename(from: string, to: string): Promise<void>;
}

export interface OpenOptions {
  /**
   * Open without taking the lock, creating anything, or ever writing. For tools
   * that only read the table list (the QR command).
   */
  readonly readOnly?: boolean;
  readonly fileOperations?: FileOperations;
}

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

function unusable(file: string, reason: string): StartupConfigurationError {
  return new StartupConfigurationError(
    `TABLES_DATA_FILE ${file} cannot be used: ${reason}\nThe file has not been modified.`,
  );
}

export class JsonFileTableRepository implements TableRepository {
  private readonly logger = new Logger(JsonFileTableRepository.name);
  private readonly fileOperations: FileOperations;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(
    private readonly file: string,
    private tables: readonly TableRecord[],
    private readonly readOnly: boolean,
    private readonly lockFile: string | undefined,
    fileOperations: FileOperations | undefined,
  ) {
    this.fileOperations = fileOperations ?? { rename };
  }

  /**
   * Load the file, creating it (and its directory) first if it is missing.
   *
   * @throws StartupConfigurationError if the file is unreadable, invalid, of an
   *   unknown version, or is open for writing in another process.
   */
  static async open(file: string, options: OpenOptions = {}): Promise<JsonFileTableRepository> {
    const readOnly = options.readOnly ?? false;
    const lockFile = readOnly ? undefined : `${file}.lock`;

    if (!readOnly) {
      try {
        await mkdir(dirname(file), { recursive: true });
      } catch (error) {
        throw unusable(
          file,
          `its directory could not be created (${errorCode(error) ?? 'unknown error'}).`,
        );
      }

      await JsonFileTableRepository.acquireLock(file, `${file}.lock`);
    }

    try {
      if (!readOnly) {
        await JsonFileTableRepository.removeLeftoverTemporaryFiles(file);
      }

      const loaded = await JsonFileTableRepository.load(file);
      const repository = new JsonFileTableRepository(
        file,
        loaded ?? [],
        readOnly,
        lockFile,
        options.fileOperations,
      );

      if (loaded === undefined && !readOnly) {
        await repository.persist([]);
      }

      return repository;
    } catch (error) {
      if (lockFile !== undefined) {
        await unlink(lockFile).catch(() => undefined);
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
    }
  }

  /** Nest calls this when the application closes. */
  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  list(): Promise<readonly TableRecord[]> {
    return Promise.resolve(this.tables.map((table) => ({ ...table })));
  }

  get(tableId: string): Promise<TableRecord | undefined> {
    const table = this.tables.find((candidate) => candidate.id === tableId);

    return Promise.resolve(table === undefined ? undefined : { ...table });
  }

  create(record: TableRecord): Promise<void> {
    return this.enqueue(async () => {
      if (this.tables.some((table) => table.id === record.id)) {
        throw new TableAlreadyExistsError(record.id);
      }

      const next = [...this.tables, { ...record }];

      await this.persist(next);
      this.tables = next;
    });
  }

  update(tableId: string, patch: TablePatch): Promise<TableRecord | undefined> {
    return this.enqueue(async () => {
      const existing = this.tables.find((table) => table.id === tableId);

      if (existing === undefined) {
        return undefined;
      }

      const updated = applyPatch(existing, patch);
      const next = this.tables.map((table) => (table.id === tableId ? updated : table));

      await this.persist(next);
      this.tables = next;

      return { ...updated };
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Run changes one at a time, in order, even if an earlier one failed. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.readOnly) {
      return Promise.reject(new Error('This table repository was opened read-only.'));
    }

    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);

    return result;
  }

  /** Write the whole document atomically: temporary file, flush, rename. */
  private async persist(tables: readonly TableRecord[]): Promise<void> {
    const document = JSON.stringify({ version: TABLES_FILE_VERSION, tables }, null, 2) + '\n';
    const temporary = `${this.file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

    try {
      const handle = await open(temporary, 'w');

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

  /** Returns the stored tables, or `undefined` if the file does not exist. */
  private static async load(file: string): Promise<readonly TableRecord[] | undefined> {
    let text: string;

    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return undefined;
      }

      throw unusable(file, `it could not be read (${errorCode(error) ?? 'unknown error'}).`);
    }

    let json: unknown;

    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw unusable(file, 'it is not valid JSON.');
    }

    const version =
      typeof json === 'object' && json !== null
        ? (json as { version?: unknown }).version
        : undefined;

    if (typeof version === 'number' && version !== TABLES_FILE_VERSION) {
      throw unusable(
        file,
        `it has version ${version}, but this build only understands version ${TABLES_FILE_VERSION}.`,
      );
    }

    const parsed = tablesFileSchema.safeParse(json);

    if (!parsed.success) {
      const reasons = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');

      throw unusable(file, `it does not have the expected structure (${reasons}).`);
    }

    return parsed.data.tables;
  }

  /** Delete temporary files a crashed writer left behind. They are never read. */
  private static async removeLeftoverTemporaryFiles(file: string): Promise<void> {
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
  private static async acquireLock(file: string, lockFile: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(lockFile, 'wx');

        try {
          await handle.writeFile(String(process.pid), 'utf8');
        } finally {
          await handle.close();
        }

        return;
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') {
          throw unusable(
            file,
            `the lock file could not be created (${errorCode(error) ?? 'unknown error'}).`,
          );
        }
      }

      const holder = Number.parseInt(await readFile(lockFile, 'utf8').catch(() => ''), 10);

      if (Number.isInteger(holder) && holder > 0 && processIsAlive(holder)) {
        throw unusable(
          file,
          `it is open for writing by process ${holder}. Only one process may write the tables file at a time: stop the API before running a command that changes tables, or use the admin endpoints instead.`,
        );
      }

      if (!Number.isInteger(holder) || holder <= 0) {
        throw unusable(
          file,
          `its lock file ${lockFile} exists but does not name a process. If no API or command is running, delete the lock file.`,
        );
      }

      // The holder is gone: the lock is left over from a crash. Take it over.
      await unlink(lockFile).catch(() => undefined);
    }

    throw unusable(file, `its lock file ${lockFile} could not be taken over.`);
  }
}

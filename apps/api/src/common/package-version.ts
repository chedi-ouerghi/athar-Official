import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Path to the service manifest.
 *
 * `package.json` sits one level above both `src/` (tests, dev server) and
 * `dist/` (compiled output), so the same relative path resolves correctly in
 * every runtime.
 */
const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');

/**
 * Version of the running service, as declared in `apps/api/package.json`.
 *
 * A missing or malformed manifest is a packaging error, so this fails loudly
 * rather than letting the service report a wrong version to clients.
 */
export function readPackageVersion(): string {
  let contents: string;
  try {
    contents = readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    throw new Error(`Unable to read package manifest at ${MANIFEST_PATH}.`);
  }

  let manifest: { version?: unknown };
  try {
    manifest = JSON.parse(contents) as { version?: unknown };
  } catch (error) {
    throw new Error(`Package manifest at ${MANIFEST_PATH} is not valid JSON.`, {
      cause: error,
    });
  }

  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`Package manifest at ${MANIFEST_PATH} does not declare a version.`);
  }

  return manifest.version;
}

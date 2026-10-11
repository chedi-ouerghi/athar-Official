import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Mobile tests cover the pure infrastructure layer — configuration resolution
 * and the HTTP transport — which is where correctness actually matters and
 * where a React Native renderer is not required.
 *
 * Screen-level rendering is deliberately not covered here; see
 * `docs/testing.md` for the rationale and for what to add once product
 * screens exist.
 *
 * This file is `.mts` because the package is CommonJS (Metro and Expo read its
 * config files with `require`), and Vite warns when an ES module config is
 * loaded as CommonJS.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Resolve `@athar/contracts` to its TypeScript source, so a change there
      // is picked up without rebuilding `dist`. (An alias, because Vitest does
      // not apply custom export conditions to a workspace package's entry.)
      '@athar/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});

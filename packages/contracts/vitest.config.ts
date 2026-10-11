import { defineConfig } from 'vitest/config';

/**
 * Contracts are plain data and pure functions, so the tests run in a bare Node
 * environment with no transformer plugins.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    reporters: ['default'],
  },
});

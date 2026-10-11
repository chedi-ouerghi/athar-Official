import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Mobile tests cover the pure infrastructure layer — configuration resolution
 * and the HTTP transport — which is where correctness actually matters and
 * where a React Native renderer is not required.
 *
 * Screen-level rendering is deliberately not covered here; see
 * `docs/testing.md` for the rationale and for what to add once product
 * screens exist.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});

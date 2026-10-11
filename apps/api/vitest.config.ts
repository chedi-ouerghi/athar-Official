import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * NestJS resolves dependencies through `emitDecoratorMetadata`, which esbuild
 * (Vitest's default transformer) does not implement. SWC is used instead so
 * unit and integration tests get the same decorator metadata as the compiled
 * build.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Each spec file builds its own Nest application; running files in separate
    // processes keeps signal listeners and the HTTP server isolated.
    pool: 'forks',
    reporters: ['default'],
  },
});

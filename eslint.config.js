/**
 * Repository-root ESLint flat config.
 *
 * There is a single lint entry point for the whole monorepo. Rules are scoped
 * by file type rather than duplicated per package, which keeps the mobile app,
 * the NestJS API and the shared packages from drifting apart.
 *
 * Shared rule sets live in `@athar/config`.
 */

const scriptConfig = require('@athar/config/eslint/script');
const nodeConfig = require('@athar/config/eslint/node');
const reactNativeConfig = require('@athar/config/eslint/react-native');

/** Restrict a flat-config array to a set of glob patterns. */
const scoped = (configs, files) => configs.map((config) => ({ ...config, files }));

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/web-build/**',
      '**/android/**',
      '**/ios/**',
      'pnpm-lock.yaml',
    ],
  },

  // Plain JS tooling files (root configs, Metro config, shared config package).
  ...scoped(scriptConfig, ['**/*.js', '**/*.cjs', '**/*.mjs']),

  // Server-side TypeScript.
  ...scoped(nodeConfig, ['apps/api/**/*.ts', 'packages/contracts/**/*.ts']),

  // React Native / Expo TypeScript.
  ...scoped(reactNativeConfig, ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx']),

  // Tests legitimately pass a mocked or spied method (`process.exit`,
  // `jest.fn()`) straight to an assertion helper, which is precisely what
  // `unbound-method` flags. Everywhere else the rule stays on.
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];

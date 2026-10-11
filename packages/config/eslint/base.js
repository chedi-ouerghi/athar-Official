/**
 * Baseline ESLint flat config shared by every package in the workspace.
 *
 * It is intentionally scoped to the platform-neutral rules so that it can be
 * reused by the NestJS API, the shared contracts package and the Expo mobile
 * app. Platform-specific globals are layered on top by `./node` and
 * `./react-native`.
 */

const path = require('node:path');

/** @type {import('eslint').Linter.Config[]} */
module.exports = require('typescript-eslint').config(
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
    ],
  },
  require('@eslint/js').configs.recommended,
  ...require('typescript-eslint').configs.recommendedTypeChecked,
  {
    // Type-aware rules need a TypeScript project to resolve types against.
    // `projectService` discovers the nearest tsconfig.json for each file, so a
    // single setting covers every package in the workspace.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.resolve(__dirname, '..', '..', '..'),
      },
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Underscore-prefixed bindings are the conventional way to mark an
      // intentionally unused argument or variable.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Prefer thrown errors / logger calls over ad-hoc console output so that
      // output always goes through the configured logger.
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
);

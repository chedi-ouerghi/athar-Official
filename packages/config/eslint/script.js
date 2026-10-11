/**
 * ESLint flat config for plain JavaScript tooling files (root config files,
 * Metro config, this package's own config modules).
 *
 * These files are not part of any TypeScript project, so type-aware linting
 * does not apply to them.
 */

const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  require('@eslint/js').configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'error',
    },
  },
];

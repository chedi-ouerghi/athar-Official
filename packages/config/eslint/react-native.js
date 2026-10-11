/**
 * ESLint flat config for the React Native / Expo mobile app.
 *
 * `eslint-config-expo/flat` already encodes the Expo, React, React Hooks and
 * import-order conventions, so it replaces the platform-neutral baseline
 * rather than being merged with it. React Native globals are layered on top.
 */

const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['**/dist/**', '**/web-build/**'],
  },
  ...require('eslint-config-expo/flat'),
  {
    languageOptions: {
      globals: {
        ...globals.es2021,
        __DEV__: 'readonly',
      },
    },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
];

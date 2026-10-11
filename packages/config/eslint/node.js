/**
 * ESLint flat config for Node.js packages (the NestJS API and shared
 * contracts). Adds Node globals on top of the shared baseline.
 */

const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...require('./base'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

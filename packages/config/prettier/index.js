/**
 * Shared Prettier configuration for the whole workspace.
 *
 * Referenced from the repository-root `.prettierrc.cjs` so that the formatter
 * has a single source of truth.
 */
module.exports = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    {
      // Generated Expo type declarations follow a different house style and
      // should never be rewritten.
      files: ['**/expo-env.d.ts', '**/.expo/types/**/*.ts'],
      options: { singleQuote: false },
    },
  ],
};

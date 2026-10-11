/**
 * Component tests. Pure logic is tested with Vitest (`*.spec.ts`, see
 * `vitest.config.mts`); anything that renders React Native runs here
 * (`*.test.tsx`). The split is by file name, so neither runner sees the other's
 * files. See docs/testing.md for why there are two.
 */
module.exports = {
  preset: 'jest-expo',
  // Rendering a whole screen is slow on the first run, and slower under load.
  testTimeout: 20000,
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  // `@athar/contracts` is consumed from source, as everywhere else in the repo.
  moduleNameMapper: {
    '^@athar/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
  resolver: '<rootDir>/jest-resolver.js',
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-safe-area-context|@athar/.*))',
  ],
};

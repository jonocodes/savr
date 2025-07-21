/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'], // Treat TypeScript files as ESM
  globals: {
    'ts-jest': {
      useESM: true, // Enable ESM support
    },
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};

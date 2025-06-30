module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.spec.ts',
    '**/__tests__/**/*.ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: false,
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(poseidon-lite|snarkjs|uuid|@solana|jayson|ethers)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  testRunner: 'jest-circus/runner',
  maxWorkers: 1,
}; 
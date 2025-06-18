module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.integration.(ts|js)', '**/?(*.)+(integration).test.(ts|js)'],
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
  passWithNoTests: true,
};

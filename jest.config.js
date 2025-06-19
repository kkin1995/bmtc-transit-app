/**
 * Root Jest Configuration for BMTC Transit App
 * Coordinates testing across all workspaces with shared utilities
 */

module.exports = {
  // Workspace configuration to run tests across all packages and services
  projects: [
    // Shared packages
    '<rootDir>/packages/config',
    '<rootDir>/packages/database', 
    '<rootDir>/packages/shared',
    '<rootDir>/packages/types',
    '<rootDir>/packages/utils',
    
    // Microservices
    '<rootDir>/services/api-gateway',
    '<rootDir>/services/user-service',
    '<rootDir>/services/location-service',
    '<rootDir>/services/realtime-service',
    '<rootDir>/services/ml-validation-service',
    '<rootDir>/services/gamification-service',
    
    // Mobile app
    '<rootDir>/mobile',
  ],

  // Global test configuration
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(ts|js)',
    '**/?(*.)+(spec|test).(ts|js)',
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/__tests__/fixtures/',
    '/__tests__/utils/',
  ],

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,js}',
    'services/*/src/**/*.{ts,js}',
    'mobile/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/__tests__/**',
    '!**/coverage/**',
  ],
  
  // Coverage thresholds - ensuring quality
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Coverage reporting
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary', 
    'lcov',
    'html',
    'clover',
  ],

  // Global setup and teardown
  globalSetup: '<rootDir>/jest.setup.js',
  globalTeardown: '<rootDir>/jest.teardown.js',
  
  // Setup files that run before each test file
  setupFilesAfterEnv: [
    '<rootDir>/jest.setupAfterEnv.js',
  ],

  // Module path mapping for shared utilities
  moduleNameMapping: {
    '^@bmtc/config$': '<rootDir>/packages/config/src',
    '^@bmtc/database$': '<rootDir>/packages/database/src',
    '^@bmtc/shared$': '<rootDir>/packages/shared/src',
    '^@bmtc/types$': '<rootDir>/packages/types/src',
    '^@bmtc/utils$': '<rootDir>/packages/utils/src',
    '^@test/(.*)$': '<rootDir>/packages/shared/src/test-utils/$1',
  },

  // TypeScript support
  preset: 'ts-jest',
  
  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,
  
  // Performance settings
  maxWorkers: '50%',
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Detect open handles (useful for debugging)
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Verbose output for better debugging
  verbose: true,
  
  // Transform settings for TypeScript
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020'],
          allowJs: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          moduleResolution: 'node',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
        },
      },
    }],
  },

  // File extensions to consider
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Pass with no tests (useful during development)
  passWithNoTests: true,
  
  // Error on deprecated APIs
  errorOnDeprecated: true,
};
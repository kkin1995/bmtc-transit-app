/**
 * Jest Setup After Environment - Runs before each test file
 * Configures per-test setup and utilities
 */

// Extend Jest matchers for better assertions
expect.extend({
  /**
   * Custom matcher for HTTP response validation
   */
  toHaveHttpStatus(received, expected) {
    const pass = received.status === expected;
    
    return {
      message: () => 
        `expected response to have status ${expected}, but received ${received.status}`,
      pass,
    };
  },

  /**
   * Custom matcher for health check responses
   */
  toBeHealthy(received) {
    const isHealthy = received.body?.status === 'healthy';
    
    return {
      message: () => 
        `expected health check to return healthy status, but received: ${JSON.stringify(received.body)}`,
      pass: isHealthy,
    };
  },

  /**
   * Custom matcher for database connections
   */
  toBeConnectedToDatabase(received) {
    const isConnected = received && typeof received.query === 'function';
    
    return {
      message: () => 
        `expected to have active database connection`,
      pass: isConnected,
    };
  },
});

// Global test timeout configuration
jest.setTimeout(30000); // 30 seconds for integration tests

// Mock console methods to reduce noise during tests
const originalConsole = console;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  if (process.env.NODE_ENV === 'test' && !process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    // Keep console.error for important debugging
  }
});

afterAll(() => {
  // Restore console methods
  if (process.env.NODE_ENV === 'test' && !process.env.VERBOSE_TESTS) {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
  }
});

// Global test utilities available in all tests
global.testUtils = {
  /**
   * Create a delay for async testing
   */
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Generate random test data
   */
  randomString: (length = 10) => 
    Math.random().toString(36).substring(2, 2 + length),
  
  /**
   * Generate random port for testing
   */
  randomPort: () => Math.floor(Math.random() * 10000) + 30000,
  
  /**
   * Mock environment variables for testing
   */
  mockEnv: (vars) => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, ...vars };
    
    return () => {
      process.env = originalEnv;
    };
  },
  
  /**
   * Wait for condition to be true
   */
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },
};

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
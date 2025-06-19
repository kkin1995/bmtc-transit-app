/**
 * Mock Test Helpers
 * Utilities for creating mocks and stubs in tests
 */

import { jest } from '@jest/globals';

/**
 * Mock Express request object
 */
export function mockRequest(overrides: any = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    get: jest.fn((header: string) => overrides.headers?.[header]),
    ...overrides,
  };
}

/**
 * Mock Express response object
 */
export function mockResponse(): any {
  const res: any = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    end: jest.fn(() => res),
    set: jest.fn(() => res),
    cookie: jest.fn(() => res),
    clearCookie: jest.fn(() => res),
    redirect: jest.fn(() => res),
  };
  return res;
}

/**
 * Mock Next function
 */
export const mockNext = jest.fn();

/**
 * Mock database client
 */
export function mockDatabaseClient(): any {
  return {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    release: jest.fn(),
  };
}

/**
 * Mock Redis client
 */
export function mockRedisClient(): any {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    flushDb: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
  };
}

/**
 * Mock InfluxDB client
 */
export function mockInfluxDBClient(): any {
  return {
    writeApi: jest.fn(() => ({
      writePoint: jest.fn(),
      writePoints: jest.fn(),
      flush: jest.fn(),
      close: jest.fn(),
    })),
    queryApi: jest.fn(() => ({
      queryRows: jest.fn(),
      queryRaw: jest.fn(),
    })),
  };
}

/**
 * Mock Kafka producer
 */
export function mockKafkaProducer(): any {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  };
}

/**
 * Mock Kafka consumer
 */
export function mockKafkaConsumer(): any {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(),
  };
}

/**
 * Mock WebSocket
 */
export function mockWebSocket(): any {
  return {
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    readyState: 1, // OPEN
  };
}

/**
 * Mock logger
 */
export function mockLogger(): any {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  };
}

/**
 * Environment variable mocker
 */
export class EnvMocker {
  private originalEnv: NodeJS.ProcessEnv;

  private mockedVars: Record<string, string> = {};

  constructor() {
    this.originalEnv = { ...process.env };
  }

  /**
   * Set environment variable
   */
  set(key: string, value: string): this {
    this.mockedVars[key] = value;
    process.env[key] = value;
    return this;
  }

  /**
   * Set multiple environment variables
   */
  setMany(vars: Record<string, string>): this {
    Object.entries(vars).forEach(([key, value]) => {
      this.set(key, value);
    });
    return this;
  }

  /**
   * Restore original environment
   */
  restore(): void {
    // Remove mocked variables
    Object.keys(this.mockedVars).forEach(key => {
      if (this.originalEnv[key] !== undefined) {
        process.env[key] = this.originalEnv[key];
      } else {
        delete process.env[key];
      }
    });

    this.mockedVars = {};
  }
}

/**
 * Mock service configuration
 */
export function mockServiceConfig(overrides: any = {}): any {
  return {
    port: 3000,
    database: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_password',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 1,
    },
    influxdb: {
      url: 'http://localhost:8086',
      token: 'test-token',
      org: 'test-org',
      bucket: 'test-bucket',
    },
    kafka: {
      brokers: ['localhost:9092'],
      clientId: 'test-client',
    },
    jwt: {
      secret: 'test-secret',
      expiresIn: '1h',
    },
    ...overrides,
  };
}

/**
 * Mock GPS location data
 */
export function mockLocationData(overrides: any = {}): any {
  return {
    latitude: 12.9716 + (Math.random() - 0.5) * 0.1, // Bangalore area
    longitude: 77.5946 + (Math.random() - 0.5) * 0.1,
    accuracy: Math.random() * 20 + 5, // 5-25 meters
    altitude: Math.random() * 100 + 800, // 800-900 meters
    heading: Math.random() * 360,
    speed: Math.random() * 60, // 0-60 km/h
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Mock user data
 */
export function mockUserData(overrides: any = {}): any {
  return {
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    phoneNumber: `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    isVerified: true,
    privacySettings: {
      locationSharing: true,
      dataRetention: '24h',
    },
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Mock route data
 */
export function mockRouteData(overrides: any = {}): any {
  return {
    id: `route-${Math.random().toString(36).substr(2, 9)}`,
    routeNumber: `${Math.floor(Math.random() * 900) + 100}${String.fromCharCode(65 + Math.floor(Math.random() * 3))}`,
    routeName: 'Test Route Name',
    isActive: true,
    direction: Math.random() > 0.5 ? 'UP' : 'DOWN',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Mock timing utilities
 */
export class MockTimer {
  private timers: NodeJS.Timeout[] = [];

  /**
   * Create a mock timer
   */
  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(callback, delay);
    this.timers.push(timer);
    return timer;
  }

  /**
   * Create a mock interval
   */
  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setInterval(callback, delay);
    this.timers.push(timer);
    return timer;
  }

  /**
   * Clear all timers
   */
  clearAll(): void {
    this.timers.forEach(timer => {
      clearTimeout(timer);
      clearInterval(timer);
    });
    this.timers = [];
  }
}

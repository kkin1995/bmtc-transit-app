/**
 * Database Test Helpers
 * Utilities for database testing and cleanup
 */

import { Client as PostgresClient } from 'pg';

export interface TestDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Create test database connection
 */
export async function createTestDbConnection(
  config?: Partial<TestDatabaseConfig>
): Promise<PostgresClient> {
  const dbConfig: TestDatabaseConfig = {
    host: process.env.TEST_POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
    database: process.env.TEST_POSTGRES_DB || 'bmtc_test',
    user: process.env.TEST_POSTGRES_USER || 'bmtc_user',
    password: process.env.TEST_POSTGRES_PASSWORD || 'bmtc_password',
    ...config,
  };

  const client = new PostgresClient(dbConfig);
  await client.connect();
  return client;
}

/**
 * Execute database cleanup
 */
export async function cleanupTestDatabase(client: PostgresClient): Promise<void> {
  const tables = [
    'location_data',
    'user_sessions',
    'user_contributions',
    'routes',
    'stops',
    'users',
    'reports',
    'achievements',
    'leaderboard_entries',
  ];

  for (const table of tables) {
    try {
      await client.query(`TRUNCATE TABLE IF EXISTS ${table} CASCADE`);
    } catch (error) {
      // Table might not exist yet, which is fine
      console.debug(`Table ${table} cleanup skipped:`, error);
    }
  }
}

/**
 * Create test database transaction
 */
export class TestTransaction {
  private client: PostgresClient;

  private isActive = false;

  constructor(client: PostgresClient) {
    this.client = client;
  }

  async begin(): Promise<void> {
    await this.client.query('BEGIN');
    this.isActive = true;
  }

  async rollback(): Promise<void> {
    if (this.isActive) {
      await this.client.query('ROLLBACK');
      this.isActive = false;
    }
  }

  async commit(): Promise<void> {
    if (this.isActive) {
      await this.client.query('COMMIT');
      this.isActive = false;
    }
  }

  get client(): PostgresClient {
    return this.client;
  }
}

/**
 * Setup test database with transaction rollback
 */
export async function withTestDatabase<T>(
  testFn: (client: PostgresClient) => Promise<T>
): Promise<T> {
  const client = await createTestDbConnection();
  const transaction = new TestTransaction(client);

  try {
    await transaction.begin();
    const result = await testFn(client);
    await transaction.rollback(); // Always rollback for tests
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Seed test data helpers
 */
export const TestDataSeeds = {
  /**
   * Create test user
   */
  async createTestUser(client: PostgresClient, userData?: Partial<any>): Promise<any> {
    const defaultUser = {
      id: `test-user-${Math.random().toString(36).substr(2, 9)}`,
      phone_number: `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      is_verified: true,
      privacy_settings: { location_sharing: true },
      created_at: new Date(),
      ...userData,
    };

    const result = await client.query(
      'INSERT INTO users (id, phone_number, is_verified, privacy_settings, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        defaultUser.id,
        defaultUser.phone_number,
        defaultUser.is_verified,
        JSON.stringify(defaultUser.privacy_settings),
        defaultUser.created_at,
      ]
    );

    return result.rows[0];
  },

  /**
   * Create test route
   */
  async createTestRoute(client: PostgresClient, routeData?: Partial<any>): Promise<any> {
    const defaultRoute = {
      id: `test-route-${Math.random().toString(36).substr(2, 9)}`,
      route_number: `${Math.floor(Math.random() * 900) + 100}A`,
      route_name: 'Test Route',
      is_active: true,
      created_at: new Date(),
      ...routeData,
    };

    const result = await client.query(
      'INSERT INTO routes (id, route_number, route_name, is_active, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        defaultRoute.id,
        defaultRoute.route_number,
        defaultRoute.route_name,
        defaultRoute.is_active,
        defaultRoute.created_at,
      ]
    );

    return result.rows[0];
  },

  /**
   * Create test stop
   */
  async createTestStop(client: PostgresClient, stopData?: Partial<any>): Promise<any> {
    const defaultStop = {
      id: `test-stop-${Math.random().toString(36).substr(2, 9)}`,
      stop_name: 'Test Stop',
      latitude: 12.9716 + (Math.random() - 0.5) * 0.1, // Bangalore area
      longitude: 77.5946 + (Math.random() - 0.5) * 0.1,
      is_active: true,
      created_at: new Date(),
      ...stopData,
    };

    const result = await client.query(
      'INSERT INTO stops (id, stop_name, latitude, longitude, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [
        defaultStop.id,
        defaultStop.stop_name,
        defaultStop.latitude,
        defaultStop.longitude,
        defaultStop.is_active,
        defaultStop.created_at,
      ]
    );

    return result.rows[0];
  },
};

/**
 * Service Test Helpers
 * Utilities for testing services and their interactions
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import axios from 'axios';

export interface ServiceConfig {
  name: string;
  port: number;
  healthPath?: string;
  startCommand?: string;
  cwd?: string;
}

/**
 * Service manager for testing
 */
export class TestServiceManager {
  private services = new Map<string, ChildProcess>();

  private serviceConfigs = new Map<string, ServiceConfig>();

  /**
   * Register a service for testing
   */
  register(config: ServiceConfig): void {
    this.serviceConfigs.set(config.name, config);
  }

  /**
   * Start a service
   */
  async startService(serviceName: string): Promise<void> {
    const config = this.serviceConfigs.get(serviceName);
    if (!config) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    const process = spawn('npm', ['run', 'dev'], {
      cwd: config.cwd || join(process.cwd(), 'services', serviceName),
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: config.port.toString(),
        NODE_ENV: 'test',
      },
    });

    this.services.set(serviceName, process);

    // Wait for service to be ready
    await this.waitForService(config);
  }

  /**
   * Stop a service
   */
  async stopService(serviceName: string): Promise<void> {
    const process = this.services.get(serviceName);
    if (process) {
      process.kill('SIGTERM');
      this.services.delete(serviceName);
    }
  }

  /**
   * Stop all services
   */
  async stopAllServices(): Promise<void> {
    const promises = Array.from(this.services.keys()).map(name => this.stopService(name));
    await Promise.all(promises);
  }

  /**
   * Check if service is running
   */
  async isServiceRunning(serviceName: string): Promise<boolean> {
    const config = this.serviceConfigs.get(serviceName);
    if (!config) return false;

    try {
      const response = await axios.get(
        `http://localhost:${config.port}${config.healthPath || '/health'}`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Wait for service to be ready
   */
  private async waitForService(config: ServiceConfig, timeout = 30000): Promise<void> {
    const start = Date.now();
    const healthUrl = `http://localhost:${config.port}${config.healthPath || '/health'}`;

    while (Date.now() - start < timeout) {
      try {
        const response = await axios.get(healthUrl, { timeout: 2000 });
        if (response.status === 200) {
          return;
        }
      } catch {
        // Service not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Service ${config.name} did not start within ${timeout}ms`);
  }

  /**
   * Get service URL
   */
  getServiceUrl(serviceName: string, path = ''): string {
    const config = this.serviceConfigs.get(serviceName);
    if (!config) {
      throw new Error(`Service ${serviceName} not registered`);
    }
    return `http://localhost:${config.port}${path}`;
  }
}

/**
 * Database connection tester
 */
export class DatabaseTester {
  /**
   * Test PostgreSQL connection
   */
  static async testPostgresConnection(config: any): Promise<boolean> {
    try {
      const { Client } = await import('pg');
      const client = new Client(config);
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Test Redis connection
   */
  static async testRedisConnection(config: any): Promise<boolean> {
    try {
      const redis = await import('redis');
      const client = redis.createClient(config);
      await client.connect();
      await client.ping();
      await client.quit();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Test InfluxDB connection
   */
  static async testInfluxDBConnection(config: any): Promise<boolean> {
    try {
      const { InfluxDB } = await import('@influxdata/influxdb-client');
      const client = new InfluxDB(config);
      const queryApi = client.getQueryApi(config.org);
      await queryApi.queryRaw('buckets()');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Network utilities for testing
 */
export class NetworkTestUtils {
  /**
   * Check if port is available
   */
  static async isPortAvailable(port: number): Promise<boolean> {
    const net = await import('net');

    return new Promise(resolve => {
      const server = net.createServer();

      server.listen(port, () => {
        server.close(() => resolve(true));
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * Find available port
   */
  static async findAvailablePort(startPort = 3000): Promise<number> {
    let port = startPort;

    while (port < startPort + 1000) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
      port++;
    }

    throw new Error(`No available port found starting from ${startPort}`);
  }

  /**
   * Wait for port to be open
   */
  static async waitForPort(port: number, host = 'localhost', timeout = 10000): Promise<void> {
    const net = await import('net');
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();

          socket.setTimeout(1000);
          socket.on('connect', () => {
            socket.destroy();
            resolve();
          });
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('Timeout'));
          });
          socket.on('error', reject);

          socket.connect(port, host);
        });

        return; // Port is open
      } catch {
        // Port not open yet
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    throw new Error(`Port ${port} did not open within ${timeout}ms`);
  }
}

/**
 * Load testing utilities
 */
export class LoadTestUtils {
  /**
   * Run concurrent requests
   */
  static async runConcurrentRequests(
    requestFn: () => Promise<any>,
    concurrency: number,
    totalRequests: number
  ): Promise<any[]> {
    const results: any[] = [];
    const chunks = Math.ceil(totalRequests / concurrency);

    for (let chunk = 0; chunk < chunks; chunk++) {
      const requestsInChunk = Math.min(concurrency, totalRequests - chunk * concurrency);

      const promises = Array(requestsInChunk)
        .fill(0)
        .map(() => requestFn());

      const chunkResults = await Promise.allSettled(promises);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Measure request performance
   */
  static async measurePerformance(
    requestFn: () => Promise<any>
  ): Promise<{ duration: number; result: any }> {
    const start = process.hrtime.bigint();
    const result = await requestFn();
    const end = process.hrtime.bigint();

    const duration = Number(end - start) / 1_000_000; // Convert to milliseconds

    return { duration, result };
  }
}

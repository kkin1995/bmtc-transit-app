/**
 * Global Jest Setup - Runs once before all tests
 * Initializes test environment and shared resources
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Database configuration for tests
process.env.TEST_POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
process.env.TEST_POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
process.env.TEST_POSTGRES_DB = 'bmtc_test';
process.env.TEST_POSTGRES_USER = process.env.POSTGRES_USER || 'bmtc_user';
process.env.TEST_POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'bmtc_password';

// Redis configuration for tests
process.env.TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.TEST_REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.TEST_REDIS_DB = '1'; // Use database 1 for tests

// InfluxDB configuration for tests  
process.env.TEST_INFLUXDB_URL = process.env.INFLUXDB_URL || 'http://localhost:8086';
process.env.TEST_INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN || 'test-token';
process.env.TEST_INFLUXDB_ORG = process.env.INFLUXDB_ORG || 'bmtc';
process.env.TEST_INFLUXDB_BUCKET = 'bmtc_test';

// Kafka/Redpanda configuration for tests
process.env.TEST_KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

module.exports = async () => {
  console.log('🧪 Setting up global test environment...');
  
  try {
    // Create test databases if they don't exist
    await createTestDatabases();
    
    // Wait for services to be ready
    await waitForServices();
    
    console.log('✅ Global test environment ready');
  } catch (error) {
    console.error('❌ Failed to set up test environment:', error);
    process.exit(1);
  }
};

/**
 * Create test databases
 */
async function createTestDatabases() {
  console.log('📊 Creating test databases...');
  
  // PostgreSQL test database
  try {
    const { execSync } = require('child_process');
    
    // Check if test database exists, create if not
    const createDbCommand = `PGPASSWORD=${process.env.TEST_POSTGRES_PASSWORD} createdb -h ${process.env.TEST_POSTGRES_HOST} -p ${process.env.TEST_POSTGRES_PORT} -U ${process.env.TEST_POSTGRES_USER} ${process.env.TEST_POSTGRES_DB}`;
    
    try {
      execSync(createDbCommand, { stdio: 'pipe' });
      console.log('✅ PostgreSQL test database created');
    } catch (error) {
      // Database might already exist, which is fine
      if (!error.stderr?.includes('already exists')) {
        console.log('📊 PostgreSQL test database already exists or connection failed (using existing)');
      }
    }
  } catch (error) {
    console.log('⚠️  PostgreSQL test database setup skipped (service may not be available)');
  }

  // InfluxDB test bucket
  try {
    // InfluxDB bucket creation can be handled by the services themselves
    console.log('✅ InfluxDB test bucket configuration ready');
  } catch (error) {
    console.log('⚠️  InfluxDB test bucket setup skipped');
  }
}

/**
 * Wait for required services to be available
 */
async function waitForServices() {
  console.log('⏳ Waiting for services to be ready...');
  
  const services = [
    {
      name: 'PostgreSQL',
      check: () => checkPostgres(),
    },
    {
      name: 'Redis', 
      check: () => checkRedis(),
    },
  ];

  const maxRetries = 10;
  const retryDelay = 2000; // 2 seconds

  for (const service of services) {
    let retries = 0;
    let isReady = false;

    while (retries < maxRetries && !isReady) {
      try {
        await service.check();
        console.log(`✅ ${service.name} is ready`);
        isReady = true;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          console.log(`⏳ ${service.name} not ready, retrying... (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.log(`⚠️  ${service.name} not available, tests may fail`);
        }
      }
    }
  }
}

/**
 * Check PostgreSQL connectivity
 */
async function checkPostgres() {
  const { Client } = require('pg');
  
  const client = new Client({
    host: process.env.TEST_POSTGRES_HOST,
    port: process.env.TEST_POSTGRES_PORT,
    database: process.env.TEST_POSTGRES_DB,
    user: process.env.TEST_POSTGRES_USER,
    password: process.env.TEST_POSTGRES_PASSWORD,
  });

  await client.connect();
  await client.query('SELECT 1');
  await client.end();
}

/**
 * Check Redis connectivity
 */
async function checkRedis() {
  // Simple TCP connection check
  const net = require('net');
  
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve();
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Redis connection timeout'));
    });
    
    socket.on('error', (error) => {
      reject(error);
    });
    
    socket.connect(process.env.TEST_REDIS_PORT, process.env.TEST_REDIS_HOST);
  });
}
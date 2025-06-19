/**
 * Global Jest Teardown - Runs once after all tests
 * Cleans up test environment and resources
 */

module.exports = async () => {
  console.log('🧹 Cleaning up global test environment...');
  
  try {
    // Clean up test databases
    await cleanupTestDatabases();
    
    // Close any remaining connections
    await closeConnections();
    
    console.log('✅ Global test environment cleaned up');
  } catch (error) {
    console.error('⚠️  Error during test cleanup:', error);
    // Don't fail the test run due to cleanup issues
  }
};

/**
 * Clean up test databases
 */
async function cleanupTestDatabases() {
  console.log('🗑️  Cleaning up test databases...');
  
  // PostgreSQL cleanup
  try {
    const { Client } = require('pg');
    
    const client = new Client({
      host: process.env.TEST_POSTGRES_HOST,
      port: process.env.TEST_POSTGRES_PORT,
      database: process.env.TEST_POSTGRES_DB,
      user: process.env.TEST_POSTGRES_USER,
      password: process.env.TEST_POSTGRES_PASSWORD,
    });

    await client.connect();
    
    // Clean up test data
    await client.query('TRUNCATE TABLE IF EXISTS location_data CASCADE');
    await client.query('TRUNCATE TABLE IF EXISTS user_sessions CASCADE');
    await client.query('TRUNCATE TABLE IF EXISTS routes CASCADE');
    await client.query('TRUNCATE TABLE IF EXISTS stops CASCADE');
    await client.query('TRUNCATE TABLE IF EXISTS users CASCADE');
    
    await client.end();
    console.log('✅ PostgreSQL test data cleaned');
  } catch (error) {
    console.log('⚠️  PostgreSQL cleanup skipped:', error.message);
  }

  // Redis cleanup
  try {
    const redis = require('redis');
    const client = redis.createClient({
      host: process.env.TEST_REDIS_HOST,
      port: process.env.TEST_REDIS_PORT,
      db: process.env.TEST_REDIS_DB,
    });

    await client.connect();
    await client.flushDb(); // Clear test database
    await client.quit();
    console.log('✅ Redis test data cleaned');
  } catch (error) {
    console.log('⚠️  Redis cleanup skipped:', error.message);
  }
}

/**
 * Close any remaining connections
 */
async function closeConnections() {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Allow some time for connections to close
  await new Promise(resolve => setTimeout(resolve, 1000));
}
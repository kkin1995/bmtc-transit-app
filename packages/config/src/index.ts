/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions, arrow-body-style */
/**
 * Configuration Management
 * Environment-based configuration for BMTC Transit App services
 */

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Redis configuration interface
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  database: DatabaseConfig;
  redis: RedisConfig;
}

/**
 * Gets configuration from environment variables with defaults
 */
export const getConfig = (): AppConfig => {
  return {
    port: Number(process.env.PORT) || 3000,
    environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'bmtc_transit_dev',
      username: process.env.DB_USER || 'bmtc_user',
      password: process.env.DB_PASSWORD || 'bmtc_password',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
    },
  };
};

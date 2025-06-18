/* eslint-disable arrow-body-style */
/**
 * Database Utilities and Migrations
 * Common database utilities and migration system for BMTC Transit App
 */

/**
 * Migration interface
 */
export interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
  createdAt: string;
}

/**
 * Database connection configuration
 */
export interface DbConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Creates a database connection string from configuration
 */
export const createConnectionString = (config: DbConnection): string => {
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
};

/**
 * Validates database connection configuration
 */
export const validateDbConfig = (config: DbConnection): boolean => {
  return Boolean(
    config.host && config.port > 0 && config.database && config.user && config.password
  );
};

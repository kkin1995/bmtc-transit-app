/**
 * Shared Constants and Utilities
 * Common constants and utilities used across BMTC Transit App services
 */

/**
 * Application-wide constants
 */
export const APP_CONSTANTS = {
  NAME: 'BMTC Transit App',
  VERSION: '1.0.0',
  API_VERSION: 'v1',
} as const;

/**
 * Service port mappings
 */
export const SERVICE_PORTS = {
  API_GATEWAY: 3000,
  USER_SERVICE: 3001,
  LOCATION_SERVICE: 3002,
  REALTIME_SERVICE: 3003,
  ML_VALIDATION_SERVICE: 3004,
  GAMIFICATION_SERVICE: 3005,
} as const;

/**
 * Common HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

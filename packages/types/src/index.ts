/**
 * TypeScript Type Definitions
 * Common type definitions used across BMTC Transit App services
 */

/**
 * Base API response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Location coordinates
 */
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

/**
 * User data structure
 */
export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * BMTC route information
 */
export interface BmtcRoute {
  id: string;
  routeNumber: string;
  routeName: string;
  fromStop: string;
  toStop: string;
  isActive: boolean;
}

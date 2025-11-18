/**
 * API module exports
 *
 * Centralized exports for the BMTC Transit API client
 */

// Client functions
export {
  fetchStops,
  fetchRoutes,
  fetchStopSchedule,
  fetchEta,
  bmtcApi,
  default as apiClient,
} from './client';

// Types
export type {
  // Error types
  APIError,
  // GTFS entities
  Stop,
  Route,
  TripInfo,
  StopTime,
  Departure,
  // Response types
  StopsListResponse,
  RoutesListResponse,
  ScheduleResponse,
  ETAResponseV11,
  // ETA detail types
  SegmentInfo,
  ScheduledInfo,
  PredictionInfo,
  // Request parameter types
  FetchStopsParams,
  FetchRoutesParams,
  FetchScheduleParams,
  FetchEtaParams,
} from './types';

// Error classes and utilities
export {
  BMTCApiError,
  NetworkError,
  TimeoutError,
  parseErrorResponse,
  isBMTCApiError,
  isNetworkError,
  isTimeoutError,
  getUserErrorMessage,
} from './errors';

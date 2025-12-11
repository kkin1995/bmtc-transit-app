/**
 * BMTC Transit API Client
 *
 * Typed HTTP client for the BMTC Transit API backend.
 * Wraps fetch with proper error handling, timeout, and type safety.
 *
 * Endpoints:
 * - GET /v1/stops - Discover stops
 * - GET /v1/routes - Discover routes
 * - GET /v1/stops/{stop_id}/schedule - Get scheduled departures
 * - GET /v1/eta - Query ETA with predictions
 */

import { apiConfig, getApiUrl } from '../config/api';
import {
  StopsListResponse,
  RoutesListResponse,
  ScheduleResponse,
  ETAResponseV11,
  FetchStopsParams,
  FetchRoutesParams,
  FetchScheduleParams,
  FetchEtaParams,
  PostRideSummaryRequest,
  PostRideSummaryResponse,
} from './types';
import { parseErrorResponse, NetworkError, TimeoutError } from './errors';

/**
 * Build query string from parameters object
 */
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = apiConfig.timeout
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeout}ms`);
      }
      throw new NetworkError('Network request failed', error);
    }
    throw error;
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);

  // Handle non-2xx responses
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  // Parse JSON response
  const data = await response.json();
  return data as T;
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * GET /v1/stops - Discover stops
 *
 * Query GTFS stops with filtering and pagination.
 *
 * @param params - Query parameters (bbox, route_id, limit, offset)
 * @returns List of stops with pagination metadata
 *
 * @example
 * ```typescript
 * // Get all stops (first page)
 * const response = await fetchStops({ limit: 10 });
 *
 * // Get stops within bounding box
 * const response = await fetchStops({
 *   bbox: '12.9,77.5,13.1,77.7',
 *   limit: 50
 * });
 *
 * // Get stops served by route 335E
 * const response = await fetchStops({ route_id: '335E' });
 * ```
 */
export async function fetchStops(params: FetchStopsParams = {}): Promise<StopsListResponse> {
  const url = getApiUrl(`v1/stops${buildQueryString(params)}`);
  return apiFetch<StopsListResponse>(url);
}

/**
 * GET /v1/routes - Discover routes
 *
 * Query GTFS routes with filtering and pagination.
 *
 * @param params - Query parameters (stop_id, route_type, limit, offset)
 * @returns List of routes with pagination metadata
 *
 * @example
 * ```typescript
 * // Get all routes (first page)
 * const response = await fetchRoutes({ limit: 20 });
 *
 * // Get routes serving stop 20558
 * const response = await fetchRoutes({ stop_id: '20558' });
 *
 * // Filter by route type (3 = bus)
 * const response = await fetchRoutes({ route_type: 3 });
 * ```
 */
export async function fetchRoutes(params: FetchRoutesParams = {}): Promise<RoutesListResponse> {
  const url = getApiUrl(`v1/routes${buildQueryString(params)}`);
  return apiFetch<RoutesListResponse>(url);
}

/**
 * GET /v1/stops/{stop_id}/schedule - Get scheduled departures
 *
 * Query scheduled departures for a stop from GTFS data.
 *
 * @param stopId - GTFS stop identifier (required)
 * @param params - Query parameters (when, time_window_minutes, route_id)
 * @returns Scheduled departures within time window
 *
 * @example
 * ```typescript
 * // Get next hour of departures (default)
 * const response = await fetchStopSchedule('20558');
 *
 * // Get departures at specific time with 2-hour window
 * const response = await fetchStopSchedule('20558', {
 *   when: '2025-11-18T14:30:00Z',
 *   time_window_minutes: 120
 * });
 *
 * // Filter by route
 * const response = await fetchStopSchedule('20558', {
 *   route_id: '335E'
 * });
 * ```
 */
export async function fetchStopSchedule(
  stopId: string,
  params: FetchScheduleParams = {}
): Promise<ScheduleResponse> {
  const url = getApiUrl(`v1/stops/${stopId}/schedule${buildQueryString(params)}`);
  return apiFetch<ScheduleResponse>(url);
}

/**
 * GET /v1/eta - Query ETA with predictions
 *
 * Return both GTFS scheduled duration and ML-predicted ETA.
 *
 * @param params - Query parameters (route_id, direction_id, from_stop_id, to_stop_id, when)
 * @returns ETA with schedule and prediction data
 *
 * @example
 * ```typescript
 * // Get ETA for current time (default)
 * const response = await fetchEta({
 *   route_id: '335E',
 *   direction_id: 0,
 *   from_stop_id: '20558',
 *   to_stop_id: '29374'
 * });
 *
 * // Get ETA at specific time
 * const response = await fetchEta({
 *   route_id: '335E',
 *   direction_id: 0,
 *   from_stop_id: '20558',
 *   to_stop_id: '29374',
 *   when: '2025-11-18T14:30:00Z'
 * });
 * ```
 */
export async function fetchEta(params: FetchEtaParams): Promise<ETAResponseV11> {
  const url = getApiUrl(`v1/eta${buildQueryString(params)}`);
  return apiFetch<ETAResponseV11>(url);
}

/**
 * POST /v1/ride_summary - Submit ride for learning
 *
 * Ingest a single ride consisting of ordered segments. The server updates
 * per-segment×time-bin statistics (Welford mean/variance, EMA) and logs
 * rejections (outliers, low confidence, etc.).
 *
 * **Authentication:** Requires Bearer token
 * **Idempotency:** Requires Idempotency-Key header
 *
 * @param request - Ride summary request body
 * @param apiKey - API key for Bearer token authentication
 * @param idempotencyKey - UUIDv4 idempotency key for request deduplication
 * @returns Ride summary response with acceptance/rejection counts
 *
 * @throws {BMTCApiError} For API errors (400, 401, 409, 422, 429, 500)
 * @throws {NetworkError} For network failures
 * @throws {TimeoutError} For request timeouts
 *
 * @example
 * ```typescript
 * // Submit a single-segment ride
 * const response = await postRideSummary(
 *   {
 *     route_id: '335E',
 *     direction_id: 0,
 *     device_bucket: '7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d',
 *     segments: [
 *       {
 *         from_stop_id: '20558',
 *         to_stop_id: '29374',
 *         duration_sec: 320.5,
 *         dwell_sec: 25.0,
 *         mapmatch_conf: 0.86,
 *         observed_at_utc: '2025-10-22T10:33:00Z',
 *       },
 *     ],
 *   },
 *   'your-api-key',
 *   '550e8400-e29b-41d4-a716-446655440000'
 * );
 *
 * console.log(`Accepted: ${response.accepted_segments}, Rejected: ${response.rejected_segments}`);
 * ```
 */
export async function postRideSummary(
  request: PostRideSummaryRequest,
  apiKey: string,
  idempotencyKey: string
): Promise<PostRideSummaryResponse> {
  const url = getApiUrl('v1/ride_summary');

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(request),
  });

  // Handle non-2xx responses
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  // Parse JSON response
  const data = await response.json();
  return data as PostRideSummaryResponse;
}

/**
 * Export a default client object with all functions
 */
export const bmtcApi = {
  fetchStops,
  fetchRoutes,
  fetchStopSchedule,
  fetchEta,
  postRideSummary,
};

export default bmtcApi;

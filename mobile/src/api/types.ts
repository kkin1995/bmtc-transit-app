/**
 * TypeScript types for BMTC Transit API v1.1 (GTFS-aligned)
 *
 * These types match the backend API specification defined in:
 * backend/docs/api.md (v1.1)
 *
 * All field names follow GTFS Schedule Reference specification exactly.
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Standardized API error response
 */
export interface APIError {
  /** Machine-readable error code */
  error: 'invalid_request' | 'unauthorized' | 'not_found' | 'conflict' | 'unprocessable' | 'rate_limited' | 'server_error';
  /** Human-readable error description */
  message: string;
  /** Optional context-specific details */
  details?: Record<string, any>;
}

// ============================================================================
// GTFS Discovery Types (GET /v1/stops, GET /v1/routes)
// ============================================================================

/**
 * GTFS Stop entity
 * Maps directly to GTFS stops.txt
 */
export interface Stop {
  /** GTFS stop identifier */
  stop_id: string;
  /** Stop name */
  stop_name: string;
  /** Stop latitude (WGS84) */
  stop_lat: number;
  /** Stop longitude (WGS84) */
  stop_lon: number;
  /** Zone identifier (optional) */
  zone_id: string | null;
}

/**
 * Response for GET /v1/stops
 */
export interface StopsListResponse {
  stops: Stop[];
  /** Total count matching query (before pagination) */
  total: number;
  /** Page limit applied */
  limit: number;
  /** Page offset applied */
  offset: number;
}

/**
 * GTFS Route entity
 * Maps directly to GTFS routes.txt
 */
export interface Route {
  /** GTFS route identifier */
  route_id: string;
  /** Short route name (e.g., "335E") */
  route_short_name: string | null;
  /** Long route name (e.g., "Kengeri to Electronic City") */
  route_long_name: string | null;
  /** GTFS route type (3 = bus for BMTC) */
  route_type: number;
  /** Agency identifier (e.g., "BMTC") */
  agency_id: string | null;
}

/**
 * Response for GET /v1/routes
 */
export interface RoutesListResponse {
  routes: Route[];
  /** Total count matching query (before pagination) */
  total: number;
  /** Page limit applied */
  limit: number;
  /** Page offset applied */
  offset: number;
}

// ============================================================================
// Schedule Types (GET /v1/stops/{stop_id}/schedule)
// ============================================================================

/**
 * GTFS Trip information
 */
export interface TripInfo {
  /** GTFS trip identifier */
  trip_id: string;
  /** GTFS route identifier */
  route_id: string;
  /** GTFS service identifier (WEEKDAY, WEEKEND, etc.) */
  service_id: string;
  /** Trip headsign (destination) */
  trip_headsign: string | null;
  /** Direction ID (0 or 1) */
  direction_id: number | null;
}

/**
 * GTFS Stop Time information
 */
export interface StopTime {
  /** Arrival time in HH:MM:SS format (GTFS spec) */
  arrival_time: string;
  /** Departure time in HH:MM:SS format (GTFS spec) */
  departure_time: string;
  /** Stop sequence number */
  stop_sequence: number;
  /** Pickup type (not in our DB, returns null) */
  pickup_type: number | null;
  /** Drop-off type (not in our DB, returns null) */
  drop_off_type: number | null;
}

/**
 * Departure information (combines trip + stop_time)
 */
export interface Departure {
  trip: TripInfo;
  stop_time: StopTime;
}

/**
 * Response for GET /v1/stops/{stop_id}/schedule
 */
export interface ScheduleResponse {
  /** Stop information */
  stop: {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
  };
  /** List of upcoming departures */
  departures: Departure[];
  /** Query time in ISO-8601 UTC format */
  query_time: string;
}

// ============================================================================
// ETA Types (GET /v1/eta)
// ============================================================================

/**
 * Segment identifier
 */
export interface SegmentInfo {
  route_id: string;
  direction_id: number;
  from_stop_id: string;
  to_stop_id: string;
}

/**
 * GTFS scheduled duration information
 */
export interface ScheduledInfo {
  /** Scheduled duration from GTFS stop_times (seconds) */
  duration_sec: number;
  /** GTFS service identifier (WEEKDAY, WEEKEND, etc.) */
  service_id?: string | null;
  /** Always "gtfs" to indicate data source */
  source: 'gtfs';
}

/**
 * ML prediction information
 */
export interface PredictionInfo {
  /** Blended ETA (learned + schedule) in seconds */
  predicted_duration_sec: number;
  /** 50th percentile (median) estimate */
  p50_sec: number;
  /** 90th percentile estimate */
  p90_sec: number;
  /** Prediction confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Weight given to learned data (0.0 to 1.0) */
  blend_weight: number;
  /** Sample count used for this segment×bin */
  samples_used: number;
  /** Time bin ID (0-191) */
  bin_id: number;
  /** ISO-8601 UTC timestamp of last update */
  last_updated: string;
  /** Learning algorithm version identifier */
  model_version: string;
}

/**
 * Response for GET /v1/eta (v1.1 GTFS-aligned structure)
 */
export interface ETAResponseV11 {
  /** Segment identifier */
  segment: SegmentInfo;
  /** Query time in ISO-8601 UTC format */
  query_time: string;
  /** GTFS scheduled duration */
  scheduled: ScheduledInfo;
  /** ML prediction data */
  prediction: PredictionInfo;
}

// ============================================================================
// Request Parameter Types
// ============================================================================

/**
 * Query parameters for GET /v1/stops
 */
export interface FetchStopsParams {
  /** Bounding box filter: min_lat,min_lon,max_lat,max_lon */
  bbox?: string;
  /** Filter stops served by this route */
  route_id?: string;
  /** Maximum results per page (default 100, max 1000) */
  limit?: number;
  /** Pagination offset (default 0) */
  offset?: number;
}

/**
 * Query parameters for GET /v1/routes
 */
export interface FetchRoutesParams {
  /** Filter routes serving this stop */
  stop_id?: string;
  /** Filter by GTFS route type (3 = bus) */
  route_type?: number;
  /** Maximum results per page (default 100, max 1000) */
  limit?: number;
  /** Pagination offset (default 0) */
  offset?: number;
}

/**
 * Query parameters for GET /v1/routes/search
 */
export interface FetchRoutesSearchParams {
  /** Search query string (required, non-empty after trimming) */
  q: string;
  /** Maximum results per page (default 50, max 1000) */
  limit?: number;
  /** Pagination offset (default 0) */
  offset?: number;
}

/**
 * Query parameters for GET /v1/stops/{stop_id}/schedule
 */
export interface FetchScheduleParams {
  /** ISO-8601 UTC timestamp for query time (defaults to server "now") */
  when?: string;
  /** Look-ahead window in minutes (default 60, max 180) */
  time_window_minutes?: number;
  /** Filter departures by route */
  route_id?: string;
}

/**
 * Query parameters for GET /v1/eta
 */
export interface FetchEtaParams {
  /** GTFS route identifier (required) */
  route_id: string;
  /** Direction ID: 0 or 1 (required) */
  direction_id: number;
  /** Origin stop ID (required) */
  from_stop_id: string;
  /** Destination stop ID (required) */
  to_stop_id: string;
  /** ISO-8601 UTC timestamp (optional, defaults to server "now") */
  when?: string;
  /** DEPRECATED: Unix epoch timestamp (use 'when' instead) */
  timestamp_utc?: number;
}

// ============================================================================
// Ride Summary Types (POST /v1/ride_summary)
// ============================================================================

/**
 * Individual segment in a ride
 */
export interface RideSegment {
  /** Origin stop ID (required) */
  from_stop_id: string;
  /** Destination stop ID (required) */
  to_stop_id: string;
  /** Observed duration in seconds (required, > 0 and ≤ 7200) */
  duration_sec: number;
  /** Dwell time at origin stop in seconds (optional, ≥ 0) */
  dwell_sec?: number;
  /** Map-matching confidence score (required, 0.0 to 1.0) */
  mapmatch_conf: number;
  /** ISO-8601 UTC timestamp when segment was observed (required, within past 7 days, not future) */
  observed_at_utc: string;
}

/**
 * Request body for POST /v1/ride_summary
 */
export interface PostRideSummaryRequest {
  /** GTFS route identifier (required) */
  route_id: string;
  /** Direction ID: 0 or 1 (required) */
  direction_id: number;
  /** Privacy-preserving device identifier (required, client-generated stable hash) */
  device_bucket: string;
  /** List of segments (required, 1-50 segments) */
  segments: RideSegment[];
}

/**
 * Rejection reasons breakdown
 */
export interface RejectionReasons {
  /** Rejected as statistical outlier */
  outlier: number;
  /** Rejected due to low map-matching confidence */
  low_confidence: number;
  /** Rejected due to invalid segment (not in GTFS) */
  invalid_segment: number;
  /** Rejected due to too many segments in ride */
  too_many_segments: number;
  /** Rejected due to stale timestamp (> 7 days or future) */
  stale_timestamp: number;
}

/**
 * Response for POST /v1/ride_summary
 */
export interface PostRideSummaryResponse {
  /** Number of segments accepted for learning */
  accepted_segments: number;
  /** Number of segments rejected */
  rejected_segments: number;
  /** Breakdown of rejection reasons */
  rejected_by_reason: RejectionReasons;
}

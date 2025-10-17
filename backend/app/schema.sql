-- BMTC Transit Learning + GTFS Schema
-- SQLite with WAL mode
--
-- This schema combines:
-- 1. GTFS static data (agency, routes, stops, trips, stop_times, calendar)
-- 2. Learning data (segments, segment_stats, rides, ride_segments)
-- 3. Time bins for ETA prediction

-- ============================================================================
-- GTFS STATIC DATA TABLES
-- ============================================================================

-- Agency: Transit agency information
CREATE TABLE IF NOT EXISTS agency (
    agency_id TEXT PRIMARY KEY,
    agency_name TEXT NOT NULL,
    agency_url TEXT,
    agency_timezone TEXT,
    agency_lang TEXT
);

-- Routes: Bus routes
CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT PRIMARY KEY,
    agency_id TEXT,
    route_short_name TEXT,
    route_long_name TEXT,
    route_type INTEGER NOT NULL CHECK(route_type IN (0,1,2,3,4,5,6,7)), -- GTFS route types
    FOREIGN KEY(agency_id) REFERENCES agency(agency_id)
);

CREATE INDEX IF NOT EXISTS idx_routes_short_name ON routes(route_short_name);
CREATE INDEX IF NOT EXISTS idx_routes_agency ON routes(agency_id);

-- Stops: Bus stops with geographic coordinates
CREATE TABLE IF NOT EXISTS stops (
    stop_id TEXT PRIMARY KEY,
    stop_name TEXT NOT NULL,
    stop_lat REAL NOT NULL,
    stop_lon REAL NOT NULL,
    zone_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(stop_name);
CREATE INDEX IF NOT EXISTS idx_stops_zone ON stops(zone_id);

-- Calendar: Service patterns (weekday/weekend schedules)
CREATE TABLE IF NOT EXISTS calendar (
    service_id TEXT PRIMARY KEY,
    monday INTEGER NOT NULL CHECK(monday IN (0, 1)),
    tuesday INTEGER NOT NULL CHECK(tuesday IN (0, 1)),
    wednesday INTEGER NOT NULL CHECK(wednesday IN (0, 1)),
    thursday INTEGER NOT NULL CHECK(thursday IN (0, 1)),
    friday INTEGER NOT NULL CHECK(friday IN (0, 1)),
    saturday INTEGER NOT NULL CHECK(saturday IN (0, 1)),
    sunday INTEGER NOT NULL CHECK(sunday IN (0, 1)),
    start_date INTEGER NOT NULL, -- YYYYMMDD format
    end_date INTEGER NOT NULL     -- YYYYMMDD format
);

-- Trips: Individual scheduled trips
CREATE TABLE IF NOT EXISTS trips (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    trip_headsign TEXT,
    direction_id INTEGER CHECK(direction_id IN (0, 1)),
    shape_id TEXT,
    FOREIGN KEY(route_id) REFERENCES routes(route_id),
    FOREIGN KEY(service_id) REFERENCES calendar(service_id)
);

CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_service ON trips(service_id);
CREATE INDEX IF NOT EXISTS idx_trips_route_dir ON trips(route_id, direction_id);

-- Stop Times: Scheduled arrival/departure times for each stop on each trip
-- NOTE: This is a large table (~1.46M rows for BMTC)
CREATE TABLE IF NOT EXISTS stop_times (
    trip_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    stop_id TEXT NOT NULL,
    arrival_time TEXT NOT NULL,   -- HH:MM:SS format (can exceed 24h)
    departure_time TEXT NOT NULL, -- HH:MM:SS format (can exceed 24h)
    PRIMARY KEY(trip_id, stop_sequence),
    FOREIGN KEY(trip_id) REFERENCES trips(trip_id),
    FOREIGN KEY(stop_id) REFERENCES stops(stop_id)
);

CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip_seq ON stop_times(trip_id, stop_sequence);

-- GTFS Metadata: Track GTFS version for validation
CREATE TABLE IF NOT EXISTS gtfs_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL -- Unix timestamp
);

-- ============================================================================
-- LEARNING DATA TABLES
-- ============================================================================

-- Segments: Unique route-direction-stop pairs for learning
-- These are derived from GTFS stop_times during bootstrap
CREATE TABLE IF NOT EXISTS segments (
    segment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id TEXT NOT NULL,
    direction_id INTEGER NOT NULL,
    from_stop_id TEXT NOT NULL,
    to_stop_id TEXT NOT NULL,
    UNIQUE(route_id, direction_id, from_stop_id, to_stop_id),
    FOREIGN KEY(route_id) REFERENCES routes(route_id),
    FOREIGN KEY(from_stop_id) REFERENCES stops(stop_id),
    FOREIGN KEY(to_stop_id) REFERENCES stops(stop_id)
);

CREATE INDEX IF NOT EXISTS idx_segments_route_dir ON segments(route_id, direction_id);
CREATE INDEX IF NOT EXISTS idx_segments_stops ON segments(from_stop_id, to_stop_id);

-- Time bins: 192 bins = 96 per day-type × 2 day-types
-- Used to bucket ETA predictions by time of day and day type
CREATE TABLE IF NOT EXISTS time_bins (
    bin_id INTEGER PRIMARY KEY,
    weekday_type INTEGER NOT NULL CHECK(weekday_type IN (0, 1)), -- 0=weekday, 1=weekend
    hour_start INTEGER NOT NULL CHECK(hour_start >= 0 AND hour_start < 24),
    minute_start INTEGER NOT NULL CHECK(minute_start IN (0, 15, 30, 45))
);

-- Segment statistics: Learned ETA statistics per segment × time bin
-- Combines Welford online variance + EMA + schedule blend
CREATE TABLE IF NOT EXISTS segment_stats (
    segment_id INTEGER NOT NULL,
    bin_id INTEGER NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,                    -- Sample count
    welford_mean REAL NOT NULL DEFAULT 0.0,          -- Welford running mean
    welford_m2 REAL NOT NULL DEFAULT 0.0,            -- Welford M2 (for variance)
    ema_mean REAL NOT NULL DEFAULT 0.0,              -- Exponential moving average
    ema_var REAL NOT NULL DEFAULT 0.0,               -- EMA variance
    schedule_mean REAL NOT NULL DEFAULT 0.0,         -- Baseline from GTFS schedule
    last_update INTEGER,                             -- Unix timestamp of last update
    PRIMARY KEY(segment_id, bin_id),
    FOREIGN KEY(segment_id) REFERENCES segments(segment_id),
    FOREIGN KEY(bin_id) REFERENCES time_bins(bin_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_stats_lookup ON segment_stats(segment_id, bin_id);
CREATE INDEX IF NOT EXISTS idx_segment_stats_updated ON segment_stats(last_update);

-- Dwell statistics: Learned dwell time statistics per stop × time bin
CREATE TABLE IF NOT EXISTS dwell_stats (
    stop_id TEXT NOT NULL,
    bin_id INTEGER NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    welford_mean REAL NOT NULL DEFAULT 0.0,
    welford_m2 REAL NOT NULL DEFAULT 0.0,
    ema_mean REAL NOT NULL DEFAULT 0.0,
    ema_var REAL NOT NULL DEFAULT 0.0,
    schedule_mean REAL NOT NULL DEFAULT 0.0,
    last_update INTEGER,
    PRIMARY KEY(stop_id, bin_id),
    FOREIGN KEY(stop_id) REFERENCES stops(stop_id),
    FOREIGN KEY(bin_id) REFERENCES time_bins(bin_id)
);

CREATE INDEX IF NOT EXISTS idx_dwell_stats_lookup ON dwell_stats(stop_id, bin_id);

-- Rides: Metadata for each user-submitted ride
CREATE TABLE IF NOT EXISTS rides (
    ride_id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at INTEGER NOT NULL,  -- Unix timestamp
    segment_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rides_submitted ON rides(submitted_at);

-- Ride segments: Detailed per-segment data for each ride
-- Stores actual observed durations for learning
CREATE TABLE IF NOT EXISTS ride_segments (
    ride_id INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    segment_id INTEGER NOT NULL,
    duration_sec REAL NOT NULL,
    dwell_sec REAL,
    timestamp_utc INTEGER NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 1, -- 1=accepted, 0=rejected as outlier
    device_bucket TEXT,                  -- SHA256 hash of device_id+salt (privacy-preserving)
    mapmatch_conf REAL,                  -- Map-matching confidence score [0.0-1.0]
    rejection_reason TEXT,               -- Reason if rejected: outlier|low_mapmatch_conf|stale_timestamp|unknown_segment
    PRIMARY KEY(ride_id, seq),
    FOREIGN KEY(ride_id) REFERENCES rides(ride_id),
    FOREIGN KEY(segment_id) REFERENCES segments(segment_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_segments_ride ON ride_segments(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_segments_timestamp ON ride_segments(timestamp_utc);
CREATE INDEX IF NOT EXISTS idx_ride_segments_segment ON ride_segments(segment_id);
CREATE INDEX IF NOT EXISTS idx_ride_segments_device_bucket ON ride_segments(device_bucket);

-- ============================================================================
-- GLOBAL AGGREGATION TABLES
-- ============================================================================

-- Idempotency keys: Prevent duplicate submissions
-- TTL cleanup via retention policy (default 24 hours)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,                -- UUID provided by client
    submitted_at INTEGER NOT NULL,       -- Unix timestamp
    response_hash TEXT NOT NULL          -- SHA256 of response for verification
);

CREATE INDEX IF NOT EXISTS idx_idempotency_submitted ON idempotency_keys(submitted_at);

-- Device buckets: Privacy-preserving device tracking for abuse prevention
-- Buckets rotate daily via client-side salt rotation
CREATE TABLE IF NOT EXISTS device_buckets (
    bucket_id TEXT PRIMARY KEY,          -- SHA256(device_id + daily_salt)
    first_seen INTEGER NOT NULL,         -- Unix timestamp
    last_seen INTEGER NOT NULL,          -- Unix timestamp
    observation_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_device_bucket_last_seen ON device_buckets(last_seen);

-- Rejection log: Track rejected observations for quality monitoring
-- TTL cleanup via retention policy (default 30 days)
CREATE TABLE IF NOT EXISTS rejection_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segment_id INTEGER NOT NULL,
    bin_id INTEGER NOT NULL,
    reason TEXT NOT NULL,                -- outlier|low_mapmatch_conf|stale_timestamp|unknown_segment
    submitted_at INTEGER NOT NULL,       -- Unix timestamp
    device_bucket TEXT,
    duration_sec REAL,
    mapmatch_conf REAL,
    FOREIGN KEY(segment_id) REFERENCES segments(segment_id),
    FOREIGN KEY(bin_id) REFERENCES time_bins(bin_id)
);

CREATE INDEX IF NOT EXISTS idx_rejection_segment_bin ON rejection_log(segment_id, bin_id);
CREATE INDEX IF NOT EXISTS idx_rejection_reason ON rejection_log(reason, submitted_at);
CREATE INDEX IF NOT EXISTS idx_rejection_submitted ON rejection_log(submitted_at);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Route summary with stop count and trip count
CREATE VIEW IF NOT EXISTS route_summary AS
SELECT
    r.route_id,
    r.route_short_name,
    r.route_long_name,
    r.route_type,
    COUNT(DISTINCT t.trip_id) AS trip_count,
    COUNT(DISTINCT st.stop_id) AS stop_count
FROM routes r
LEFT JOIN trips t ON r.route_id = t.route_id
LEFT JOIN stop_times st ON t.trip_id = st.trip_id
GROUP BY r.route_id;

-- View: Stop summary with route count
CREATE VIEW IF NOT EXISTS stop_summary AS
SELECT
    s.stop_id,
    s.stop_name,
    s.stop_lat,
    s.stop_lon,
    s.zone_id,
    COUNT(DISTINCT st.trip_id) AS trip_count,
    COUNT(DISTINCT t.route_id) AS route_count
FROM stops s
LEFT JOIN stop_times st ON s.stop_id = st.stop_id
LEFT JOIN trips t ON st.trip_id = t.trip_id
GROUP BY s.stop_id;

-- View: Segment learning progress
CREATE VIEW IF NOT EXISTS segment_learning_progress AS
SELECT
    seg.segment_id,
    seg.route_id,
    seg.direction_id,
    seg.from_stop_id,
    seg.to_stop_id,
    fs.stop_name AS from_stop_name,
    ts.stop_name AS to_stop_name,
    r.route_short_name,
    COUNT(DISTINCT ss.bin_id) AS bins_with_data,
    SUM(ss.n) AS total_samples,
    AVG(ss.n) AS avg_samples_per_bin,
    MAX(ss.last_update) AS last_updated
FROM segments seg
JOIN stops fs ON seg.from_stop_id = fs.stop_id
JOIN stops ts ON seg.to_stop_id = ts.stop_id
JOIN routes r ON seg.route_id = r.route_id
LEFT JOIN segment_stats ss ON seg.segment_id = ss.segment_id
GROUP BY seg.segment_id;

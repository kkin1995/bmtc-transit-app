# GTFS Database Schema Documentation

## Overview

The BMTC Transit API uses a unified SQLite database that combines:
1. **GTFS static data** - Complete transit network information
2. **Learning data** - User-submitted ride statistics
3. **Time-binned predictions** - ETA forecasts per 15-min time slot

This design enables:
- Self-contained API (no external GTFS queries needed)
- Rich querying (routes, stops, schedules, ETAs in one place)
- Foreign key integrity across GTFS and learning tables
- Future features (trip planning, route discovery, etc.)

---

## Database Statistics (BMTC Dataset)

After bootstrap with 2025-09-02 BMTC GTFS:

| Table | Rows | Description |
|-------|------|-------------|
| `agency` | 1 | BMTC agency info |
| `routes` | 4,190 | All route variations |
| `stops` | 9,360 | Bus stop locations |
| `calendar` | 1 | Service patterns (currently unified 7-day schedule) |
| `trips` | 54,780 | Scheduled trips per day |
| `stop_times` | 1,462,417 | Stop visit times for all trips |
| `segments` | ~110,000 | Unique route-direction-stop pairs |
| `segment_stats` | ~3-5M | Segment × 192 time bins (sparse) |
| `time_bins` | 192 | Fixed (96 per day-type × 2) |
| `rides` | 0+ | User-submitted rides (grows with usage) |
| `ride_segments` | 0+ | Ride details (grows with usage) |

**Total DB size:** ~500MB-1GB after bootstrap (highly compressed with WAL)

---

## Table Schemas

### GTFS Static Data

#### `agency`
Transit agency information.

```sql
CREATE TABLE agency (
    agency_id TEXT PRIMARY KEY,
    agency_name TEXT NOT NULL,
    agency_url TEXT,
    agency_timezone TEXT,
    agency_lang TEXT
);
```

**BMTC Example:**
```
agency_id='1', agency_name='BMTC', agency_url='https://mybmtc.karnataka.gov.in'
```

---

#### `routes`
Bus routes with metadata.

```sql
CREATE TABLE routes (
    route_id TEXT PRIMARY KEY,           -- e.g., '104', '335-E ANP11-KMT-VSD'
    agency_id TEXT,
    route_short_name TEXT,               -- e.g., '335E', 'G4'
    route_long_name TEXT,                -- e.g., 'Jayanagar ⇔ Kempegowda Bus Station'
    route_type INTEGER NOT NULL,        -- GTFS type (3=bus)
    FOREIGN KEY(agency_id) REFERENCES agency(agency_id)
);

CREATE INDEX idx_routes_short_name ON routes(route_short_name);
```

**Key field:** `route_id` - Used in segments table and API requests

**Note:** BMTC has 4,190 route_id values derived from 2,936 unique short names (variants for different paths)

---

#### `stops`
Bus stop locations with coordinates.

```sql
CREATE TABLE stops (
    stop_id TEXT PRIMARY KEY,            -- e.g., '20558', '29374'
    stop_name TEXT NOT NULL,             -- e.g., '10th Cross Magadi Road'
    stop_lat REAL NOT NULL,              -- Latitude
    stop_lon REAL NOT NULL,              -- Longitude
    zone_id TEXT
);

CREATE INDEX idx_stops_name ON stops(stop_name);
```

**Usage:**
- `stop_id` used in segments, stop_times, ride validation
- `stop_lat/lon` for map display, proximity search
- 9,360 stops cover Bengaluru metro area

---

#### `calendar`
Service patterns (which days routes operate).

```sql
CREATE TABLE calendar (
    service_id TEXT PRIMARY KEY,
    monday INTEGER NOT NULL,             -- 0 or 1
    tuesday INTEGER NOT NULL,
    ... (wednesday through sunday)
    start_date INTEGER NOT NULL,         -- YYYYMMDD
    end_date INTEGER NOT NULL
);
```

**BMTC specific:** Currently has 1 service_id='1' running all 7 days.

**Learning adjustment:** We split into weekday (Mon-Fri) and weekend (Sat-Sun) bins dynamically.

---

#### `trips`
Individual scheduled trips.

```sql
CREATE TABLE trips (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    trip_headsign TEXT,                  -- Destination sign
    direction_id INTEGER,                -- 0 or 1
    shape_id TEXT,                       -- For route geometry (not used in MVP)
    FOREIGN KEY(route_id) REFERENCES routes(route_id),
    FOREIGN KEY(service_id) REFERENCES calendar(service_id)
);

CREATE INDEX idx_trips_route ON trips(route_id);
CREATE INDEX idx_trips_route_dir ON trips(route_id, direction_id);
```

**54,780 trips/day** across all routes.

---

#### `stop_times`
Scheduled arrival/departure times for each stop on each trip.

```sql
CREATE TABLE stop_times (
    trip_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,      -- 1, 2, 3, ...
    stop_id TEXT NOT NULL,
    arrival_time TEXT NOT NULL,          -- 'HH:MM:SS' (can exceed 24h)
    departure_time TEXT NOT NULL,
    PRIMARY KEY(trip_id, stop_sequence),
    FOREIGN KEY(trip_id) REFERENCES trips(trip_id),
    FOREIGN KEY(stop_id) REFERENCES stops(stop_id)
);

CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);
CREATE INDEX idx_stop_times_trip_seq ON stop_times(trip_id, stop_sequence);
```

**Largest table:** ~1.46M rows for BMTC.

**Usage:**
- Bootstrap computes `schedule_mean` from consecutive stop_times
- Can query "next 3 departures from stop X" for live schedule display

---

#### `gtfs_metadata`
Tracks GTFS version and update history.

```sql
CREATE TABLE gtfs_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL          -- Unix timestamp
);
```

**Stored keys:**
- `gtfs_version` - Feed version (e.g., '20250902')
- `gtfs_publisher` - Publisher name
- `gtfs_start_date` - Feed validity start
- `gtfs_end_date` - Feed validity end

---

### Learning Data

#### `segments`
Unique route-direction-stop pairs for ETA learning.

```sql
CREATE TABLE segments (
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
```

**Derived from GTFS:** Bootstrap creates segments from all consecutive stop pairs in stop_times.

**Example:**
```
segment_id=1, route_id='104', direction_id=0,
from_stop_id='20558', to_stop_id='29374'
```

---

#### `time_bins`
Fixed 192 time bins for temporal ETA predictions.

```sql
CREATE TABLE time_bins (
    bin_id INTEGER PRIMARY KEY,          -- 0-191
    weekday_type INTEGER NOT NULL,       -- 0=weekday, 1=weekend
    hour_start INTEGER NOT NULL,         -- 0-23
    minute_start INTEGER NOT NULL        -- 0, 15, 30, 45
);
```

**Structure:**
- Bin 0-95: Weekday, 00:00-23:45 (15-min slots)
- Bin 96-191: Weekend, 00:00-23:45

**Example:**
```
bin_id=38 → weekday_type=0, hour_start=9, minute_start=30 (Mon-Fri 09:30)
```

---

#### `segment_stats`
Learned ETA statistics per segment × time bin.

```sql
CREATE TABLE segment_stats (
    segment_id INTEGER NOT NULL,
    bin_id INTEGER NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,           -- Sample count
    welford_mean REAL NOT NULL DEFAULT 0.0, -- Online mean
    welford_m2 REAL NOT NULL DEFAULT 0.0,   -- Variance accumulator
    ema_mean REAL NOT NULL DEFAULT 0.0,     -- Exponential moving avg
    ema_var REAL NOT NULL DEFAULT 0.0,      -- EMA variance
    schedule_mean REAL NOT NULL DEFAULT 0.0,-- GTFS baseline
    last_update INTEGER,                    -- Unix timestamp
    PRIMARY KEY(segment_id, bin_id),
    FOREIGN KEY(segment_id) REFERENCES segments(segment_id),
    FOREIGN KEY(bin_id) REFERENCES time_bins(bin_id)
);
```

**Learning algorithm:**
1. `schedule_mean` seeded from GTFS at bootstrap
2. `welford_mean/m2` updated with each ride (Welford's online algorithm)
3. `ema_mean/var` updated with α=0.1
4. Final ETA = `w·welford_mean + (1−w)·schedule_mean` where `w=n/(n+20)`

---

#### `rides` & `ride_segments`
User-submitted ride data.

```sql
CREATE TABLE rides (
    ride_id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at INTEGER NOT NULL,
    segment_count INTEGER NOT NULL
);

CREATE TABLE ride_segments (
    ride_id INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    segment_id INTEGER NOT NULL,
    duration_sec REAL NOT NULL,
    dwell_sec REAL,
    timestamp_utc INTEGER NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 1,  -- 0 if outlier
    PRIMARY KEY(ride_id, seq),
    FOREIGN KEY(ride_id) REFERENCES rides(ride_id),
    FOREIGN KEY(segment_id) REFERENCES segments(segment_id)
);
```

**Retention:** `ride_segments` can be pruned after 90 days (configurable).

---

## Views

### `route_summary`
Aggregated route statistics.

```sql
CREATE VIEW route_summary AS
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
```

**Usage:** `SELECT * FROM route_summary WHERE route_short_name='335E'`

---

### `stop_summary`
Aggregated stop statistics.

```sql
CREATE VIEW stop_summary AS
SELECT
    s.stop_id,
    s.stop_name,
    s.stop_lat,
    s.stop_lon,
    COUNT(DISTINCT st.trip_id) AS trip_count,
    COUNT(DISTINCT t.route_id) AS route_count
FROM stops s
LEFT JOIN stop_times st ON s.stop_id = st.stop_id
LEFT JOIN trips t ON st.trip_id = t.trip_id
GROUP BY s.stop_id;
```

**Usage:** Find busy stops: `SELECT * FROM stop_summary ORDER BY trip_count DESC LIMIT 10`

---

### `segment_learning_progress`
Tracks learning convergence per segment.

```sql
CREATE VIEW segment_learning_progress AS
SELECT
    seg.segment_id,
    seg.route_id,
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
```

**Usage:** Monitor which segments need more data.

---

## Bootstrap Process

### Step-by-Step

1. **Init schema** (`app/schema.sql`)
   - Create all tables, indices, views
   - Enable WAL mode

2. **Load GTFS core** (`app/gtfs_bootstrap.py`)
   ```
   Step 1/8: Load agency (1 row)
   Step 2/8: Load routes (4,190 rows)
   Step 3/8: Load stops (9,360 rows)
   Step 4/8: Load calendar (1 row)
   Step 5/8: Load trips (54,780 rows)
   Step 6/8: Load stop_times (1,462,417 rows) ← ~30-60 sec
   ```

3. **Compute segments** (Step 7/8)
   - JOIN stop_times to get consecutive stop pairs
   - Extract route_id, direction_id from trips
   - Compute schedule_mean per segment×bin from departure/arrival times
   - Insert into `segments` and `segment_stats`

4. **Store metadata** (Step 8/8)
   - Extract GTFS version from feed_info.txt
   - Store in `gtfs_metadata` table

### Performance

- **Total time:** 60-90 seconds for full BMTC dataset
- **Bottleneck:** stop_times load (~1.46M rows)
- **Optimization:** Batched inserts (10K rows/batch)

### Running Bootstrap

```bash
cd backend
uv run python -m app.bootstrap
```

Expected output:
```
Initializing database at bmtc_dev.db...
Parsing GTFS from ../gtfs/bmtc.zip...
Step 1/8: Loading agency...
  Loaded 1 agencies
Step 2/8: Loading routes...
  Loaded 4190 routes
...
Step 6/8: Loading stop_times (this may take 30-60 seconds)...
    Progress: 1,462,417 stop_times loaded...
  Loaded 1,462,417 stop_times
Step 7/8: Computing segments and schedule baselines...
  Computed 3,456,789 unique segment×bin combinations
  Inserted 110,234 segments and 3,456,789 segment_stats rows
Step 8/8: Storing GTFS metadata...
  GTFS version: 20250902
Bootstrap complete.
```

---

## Query Examples

### Find all routes serving a stop
```sql
SELECT DISTINCT r.route_short_name, r.route_long_name
FROM routes r
JOIN trips t ON r.route_id = t.route_id
JOIN stop_times st ON t.trip_id = st.trip_id
WHERE st.stop_id = '20558'
ORDER BY r.route_short_name;
```

### Get next 5 departures from a stop
```sql
SELECT r.route_short_name, st.departure_time, t.trip_headsign
FROM stop_times st
JOIN trips t ON st.trip_id = t.trip_id
JOIN routes r ON t.route_id = r.route_id
WHERE st.stop_id = '20558'
  AND st.departure_time > '09:00:00'
ORDER BY st.departure_time
LIMIT 5;
```

### Check segment learning progress
```sql
SELECT route_short_name, from_stop_name, to_stop_name,
       bins_with_data, total_samples, avg_samples_per_bin
FROM segment_learning_progress
WHERE route_short_name = '335E'
ORDER BY total_samples DESC
LIMIT 10;
```

### Find segments needing more data
```sql
SELECT * FROM segment_learning_progress
WHERE total_samples < 100
ORDER BY total_samples ASC
LIMIT 20;
```

---

## Future Enhancements

### Phase 2: Discovery Endpoints

Add API endpoints to query GTFS directly:

- `GET /v1/routes` - List all routes
- `GET /v1/routes/{route_id}` - Route details
- `GET /v1/stops` - List stops (with bbox filtering)
- `GET /v1/stops/{stop_id}` - Stop details + next departures
- `GET /v1/stops/{stop_id}/routes` - Routes serving a stop

### Phase 3: Trip Planning

Use GTFS + learned ETAs for multi-segment routing:

- A* search over segment graph
- Cost function = learned ETA + transfer penalty
- `GET /v1/plan?from=STOP_A&to=STOP_Z&time=09:30`

### Phase 4: Real-time GTFS-RT

If BMTC publishes GTFS-RT:

- Add `vehicle_positions` table
- Update ETAs with live vehicle locations
- Combine schedule + learned + realtime for best accuracy

---

## Maintenance

### Re-bootstrap on GTFS Update

When new GTFS data is available:

```bash
# Backup existing DB
cp bmtc_dev.db bmtc_dev.db.backup

# Clear GTFS tables (preserve learning data)
sqlite3 bmtc_dev.db "DELETE FROM stop_times; DELETE FROM trips;
  DELETE FROM routes; DELETE FROM stops; DELETE FROM calendar;
  DELETE FROM agency; DELETE FROM segments; DELETE FROM segment_stats;"

# Re-run bootstrap
uv run python -m app.bootstrap
```

**Learning data preserved:** `rides` and `ride_segments` tables remain intact.

### Vacuum Database

Periodically reclaim space:

```bash
sqlite3 bmtc_dev.db "VACUUM;"
```

### Check Database Integrity

```bash
sqlite3 bmtc_dev.db "PRAGMA integrity_check;"
```

---

## References

- [GTFS Specification](https://gtfs.org/schedule/reference/)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [SQLite Views](https://www.sqlite.org/lang_createview.html)
- [Welford's Algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm)

"""GTFS parser to load complete GTFS data + compute schedule_mean_sec per segment×bin."""
import csv
import sqlite3
import time
from collections import defaultdict
from pathlib import Path
import zipfile


def parse_gtfs(gtfs_path: str, db_conn: sqlite3.Connection) -> str:
    """Parse GTFS and populate all tables (agency, routes, stops, trips, stop_times, segments, segment_stats).

    Returns GTFS version string.
    """
    gtfs_zip = Path(gtfs_path)
    cursor = db_conn.cursor()

    print("Step 1/8: Loading agency...")
    load_agency(gtfs_zip, cursor)

    print("Step 2/8: Loading routes...")
    load_routes(gtfs_zip, cursor)

    print("Step 3/8: Loading stops...")
    load_stops(gtfs_zip, cursor)

    print("Step 4/8: Loading calendar...")
    load_calendar(gtfs_zip, cursor)

    print("Step 5/8: Loading trips...")
    load_trips(gtfs_zip, cursor)

    print("Step 6/8: Loading stop_times (this may take 30-60 seconds)...")
    load_stop_times(gtfs_zip, cursor)

    db_conn.commit()

    print("Step 7/8: Computing segments and schedule baselines...")
    compute_segments_and_baselines(gtfs_zip, db_conn)

    print("Step 8/8: Storing GTFS metadata...")
    gtfs_version = store_metadata(gtfs_zip, cursor)
    db_conn.commit()

    return gtfs_version


def load_agency(gtfs_zip: Path, cursor: sqlite3.Cursor) -> None:
    """Load agency.txt into agency table."""
    with zipfile.ZipFile(gtfs_zip) as zf:
        with zf.open('agency.txt') as f:
            reader = csv.DictReader(line.decode('utf-8') for line in f)
            rows = []
            for row in reader:
                rows.append((
                    row.get('agency_id', '1'),
                    row['agency_name'],
                    row.get('agency_url'),
                    row.get('agency_timezone'),
                    row.get('agency_lang')
                ))

            cursor.executemany(
                "INSERT OR REPLACE INTO agency (agency_id, agency_name, agency_url, agency_timezone, agency_lang) "
                "VALUES (?, ?, ?, ?, ?)",
                rows
            )
    print(f"  Loaded {len(rows)} agencies")


def load_routes(gtfs_zip: Path, cursor: sqlite3.Cursor) -> None:
    """Load routes.txt into routes table."""
    with zipfile.ZipFile(gtfs_zip) as zf:
        with zf.open('routes.txt') as f:
            reader = csv.DictReader(line.decode('utf-8') for line in f)
            rows = []
            for row in reader:
                rows.append((
                    row['route_id'],
                    row.get('agency_id', '1'),
                    row.get('route_short_name'),
                    row.get('route_long_name'),
                    int(row['route_type'])
                ))

            cursor.executemany(
                "INSERT OR REPLACE INTO routes (route_id, agency_id, route_short_name, route_long_name, route_type) "
                "VALUES (?, ?, ?, ?, ?)",
                rows
            )
    print(f"  Loaded {len(rows)} routes")


def load_stops(gtfs_zip: Path, cursor: sqlite3.Cursor) -> None:
    """Load stops.txt into stops table."""
    with zipfile.ZipFile(gtfs_zip) as zf:
        with zf.open('stops.txt') as f:
            reader = csv.DictReader(line.decode('utf-8') for line in f)
            rows = []
            for row in reader:
                rows.append((
                    row['stop_id'],
                    row['stop_name'],
                    float(row['stop_lat']),
                    float(row['stop_lon']),
                    row.get('zone_id')
                ))

            cursor.executemany(
                "INSERT OR REPLACE INTO stops (stop_id, stop_name, stop_lat, stop_lon, zone_id) "
                "VALUES (?, ?, ?, ?, ?)",
                rows
            )
    print(f"  Loaded {len(rows)} stops")


def load_calendar(gtfs_zip: Path, cursor: sqlite3.Cursor) -> None:
    """Load calendar.txt into calendar table."""
    with zipfile.ZipFile(gtfs_zip) as zf:
        with zf.open('calendar.txt') as f:
            reader = csv.DictReader(line.decode('utf-8') for line in f)
            rows = []
            for row in reader:
                rows.append((
                    row['service_id'],
                    int(row['monday']),
                    int(row['tuesday']),
                    int(row['wednesday']),
                    int(row['thursday']),
                    int(row['friday']),
                    int(row['saturday']),
                    int(row['sunday']),
                    int(row['start_date']),
                    int(row['end_date'])
                ))

            cursor.executemany(
                "INSERT OR REPLACE INTO calendar "
                "(service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows
            )
    print(f"  Loaded {len(rows)} calendar entries")


def load_trips(gtfs_zip: Path, cursor: sqlite3.Cursor) -> None:
    """Load trips.txt into trips table."""
    with zipfile.ZipFile(gtfs_zip) as zf:
        with zf.open('trips.txt') as f:
            reader = csv.DictReader(line.decode('utf-8') for line in f)
            rows = []
            for row in reader:
                rows.append((
                    row['trip_id'],
                    row['route_id'],
                    row['service_id'],
                    row.get('trip_headsign'),
                    int(row.get('direction_id', 0)),
                    row.get('shape_id')
                ))

            cursor.executemany(
                "INSERT OR REPLACE INTO trips (trip_id, route_id, service_id, trip_headsign, direction_id, shape_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                rows
            )
    print(f"  Loaded {len(rows)} trips")


def load_stop_times(gtfs_zip: Path, cursor: sqlite3.Cursor) -> None:
    """Load stop_times.txt into stop_times table.

    This is the largest table (~1.46M rows for BMTC).
    Uses batched inserts for performance.
    """
    with zipfile.ZipFile(gtfs_zip) as zf:
        with zf.open('stop_times.txt') as f:
            reader = csv.DictReader(line.decode('utf-8') for line in f)
            rows = []
            batch_size = 10000
            total = 0

            for row in reader:
                rows.append((
                    row['trip_id'],
                    int(row['stop_sequence']),
                    row['stop_id'],
                    row['arrival_time'],
                    row['departure_time']
                ))

                if len(rows) >= batch_size:
                    cursor.executemany(
                        "INSERT OR REPLACE INTO stop_times (trip_id, stop_sequence, stop_id, arrival_time, departure_time) "
                        "VALUES (?, ?, ?, ?, ?)",
                        rows
                    )
                    total += len(rows)
                    print(f"    Progress: {total:,} stop_times loaded...", end='\r')
                    rows = []

            # Insert remaining rows
            if rows:
                cursor.executemany(
                    "INSERT OR REPLACE INTO stop_times (trip_id, stop_sequence, stop_id, arrival_time, departure_time) "
                    "VALUES (?, ?, ?, ?, ?)",
                    rows
                )
                total += len(rows)

    print(f"  Loaded {total:,} stop_times                    ")


def compute_segments_and_baselines(gtfs_zip: Path, db_conn: sqlite3.Connection) -> None:
    """Compute segments and segment_stats with schedule baselines from stop_times."""
    cursor = db_conn.cursor()

    # Read trips to get route_id, direction_id, service_id mapping
    print("  Reading trips metadata...")
    cursor.execute("SELECT trip_id, route_id, direction_id, service_id FROM trips")
    trip_meta = {row[0]: (row[1], row[2], row[3]) for row in cursor.fetchall()}

    # Read calendar to determine service days
    print("  Reading calendar...")
    cursor.execute("SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday FROM calendar")
    service_days = {}
    for row in cursor.fetchall():
        service_id = row[0]
        mon, tue, wed, thu, fri, sat, sun = row[1:8]

        day_types = []
        if any([mon, tue, wed, thu, fri]):
            day_types.append(0)  # weekday
        if any([sat, sun]):
            day_types.append(1)  # weekend

        service_days[service_id] = day_types if day_types else [0]

    # Read stop_times and compute segment durations
    print("  Computing segment durations from stop_times...")
    cursor.execute("""
        SELECT st1.trip_id, st1.stop_id, st1.departure_time, st2.stop_id, st2.arrival_time
        FROM stop_times st1
        JOIN stop_times st2 ON st1.trip_id = st2.trip_id AND st2.stop_sequence = st1.stop_sequence + 1
        ORDER BY st1.trip_id, st1.stop_sequence
    """)

    segment_times = defaultdict(list)  # (route, dir, from_stop, to_stop, bin_id) → [durations]
    count = 0

    for row in cursor.fetchall():
        trip_id, from_stop, dep_time, to_stop, arr_time = row
        count += 1
        if count % 100000 == 0:
            print(f"    Processed {count:,} segments...", end='\r')

        if trip_id not in trip_meta:
            continue

        route_id, direction_id, service_id = trip_meta[trip_id]
        day_types = service_days.get(service_id, [0])

        # Parse times
        dep_sec = parse_gtfs_time(dep_time)
        arr_sec = parse_gtfs_time(arr_time)
        if dep_sec is None or arr_sec is None:
            continue

        duration = arr_sec - dep_sec
        if duration <= 0:
            continue

        # Populate both weekday and weekend bins if service runs on both
        for weekday_type in day_types:
            bin_id = compute_bin_from_seconds(dep_sec, weekday_type)
            key = (route_id, direction_id, from_stop, to_stop, bin_id)
            segment_times[key].append(duration)

    print(f"  Computed {len(segment_times):,} unique segment×bin combinations         ")

    # Insert segments and segment_stats
    print("  Inserting segments and segment_stats...")
    segments_cache = {}  # (route, dir, from, to) → segment_id
    stats_rows = []

    for (route_id, direction_id, from_stop, to_stop, bin_id), durations in segment_times.items():
        # Get or create segment
        seg_key = (route_id, direction_id, from_stop, to_stop)
        if seg_key not in segments_cache:
            cursor.execute(
                "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
                seg_key
            )
            cursor.execute(
                "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
                seg_key
            )
            segment_id = cursor.fetchone()[0]
            segments_cache[seg_key] = segment_id
        else:
            segment_id = segments_cache[seg_key]

        # Compute mean
        schedule_mean = sum(durations) / len(durations)

        # Queue for batch insert
        stats_rows.append((segment_id, bin_id, schedule_mean))

    # Batch insert segment_stats
    cursor.executemany(
        """
        INSERT INTO segment_stats (segment_id, bin_id, schedule_mean)
        VALUES (?, ?, ?)
        ON CONFLICT(segment_id, bin_id) DO UPDATE SET schedule_mean=excluded.schedule_mean
        """,
        stats_rows
    )

    db_conn.commit()
    print(f"  Inserted {len(segments_cache):,} segments and {len(stats_rows):,} segment_stats rows")


def store_metadata(gtfs_zip: Path, cursor: sqlite3.Cursor) -> str:
    """Store GTFS metadata (version, update time)."""
    gtfs_version = "unknown"

    try:
        with zipfile.ZipFile(gtfs_zip) as zf:
            with zf.open('feed_info.txt') as f:
                reader = csv.DictReader(line.decode('utf-8') for line in f)
                for row in reader:
                    gtfs_version = row.get('feed_version', 'unknown')
                    publisher = row.get('feed_publisher_name', 'unknown')
                    start_date = row.get('feed_start_date', 'unknown')
                    end_date = row.get('feed_end_date', 'unknown')

                    cursor.execute(
                        "INSERT OR REPLACE INTO gtfs_metadata (key, value, updated_at) VALUES (?, ?, ?)",
                        ('gtfs_version', gtfs_version, int(time.time()))
                    )
                    cursor.execute(
                        "INSERT OR REPLACE INTO gtfs_metadata (key, value, updated_at) VALUES (?, ?, ?)",
                        ('gtfs_publisher', publisher, int(time.time()))
                    )
                    cursor.execute(
                        "INSERT OR REPLACE INTO gtfs_metadata (key, value, updated_at) VALUES (?, ?, ?)",
                        ('gtfs_start_date', start_date, int(time.time()))
                    )
                    cursor.execute(
                        "INSERT OR REPLACE INTO gtfs_metadata (key, value, updated_at) VALUES (?, ?, ?)",
                        ('gtfs_end_date', end_date, int(time.time()))
                    )
                    break
    except KeyError:
        # feed_info.txt may not exist
        pass

    print(f"  GTFS version: {gtfs_version}")
    return gtfs_version


def parse_gtfs_time(time_str: str) -> int:
    """Parse GTFS time (HH:MM:SS) to seconds since midnight.

    GTFS times can exceed 24h (e.g., 25:30:00).
    """
    try:
        parts = time_str.split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    except (ValueError, IndexError):
        return None


def compute_bin_from_seconds(seconds: int, weekday_type: int) -> int:
    """Compute bin_id from seconds-since-midnight and weekday_type."""
    # Normalize to 0-86399 (24h)
    seconds = seconds % 86400
    hour = seconds // 3600
    minute = (seconds % 3600) // 60
    minute_slot = minute // 15

    return weekday_type * 96 + hour * 4 + minute_slot

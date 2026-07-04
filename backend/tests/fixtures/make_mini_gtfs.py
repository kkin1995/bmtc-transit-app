"""Generate a minimal, deterministic, VALID synthetic GTFS feed for tests.

Produces `mini_gtfs.zip` alongside this script — a handful of rows (1 agency,
2 routes, 4 stops, 2 trips, 6 stop_times, 2 calendar rows) matching the exact
columns `app.gtfs_bootstrap.parse_gtfs()` expects, so it can be parsed
end-to-end by `uv run python -m app.bootstrap` without pulling in the real
1.46M-row `gtfs/bmtc.zip` (DATA-04, Task 1).

Re-running this script always produces byte-identical .txt contents (the
zip's internal file timestamps are pinned to a fixed date so the archive
itself is also reproducible).

Usage:
    uv run python tests/fixtures/make_mini_gtfs.py
"""

import csv
import io
import zipfile
from pathlib import Path

FIXTURE_DIR = Path(__file__).parent
OUTPUT_ZIP = FIXTURE_DIR / "mini_gtfs.zip"

# Fixed archive member mtime so re-running this script is byte-for-byte
# reproducible (zipfile embeds per-entry timestamps by default).
FIXED_DATE_TIME = (2026, 1, 1, 0, 0, 0)


AGENCY_ROWS = [
    {
        "agency_id": "BMTC",
        "agency_name": "Bangalore Metropolitan Transport Corporation",
        "agency_url": "http://mybmtc.com",
        "agency_timezone": "Asia/Kolkata",
        "agency_lang": "en",
    }
]

ROUTES_ROWS = [
    {
        "route_id": "MINI_R1",
        "agency_id": "BMTC",
        "route_short_name": "M1",
        "route_long_name": "Mini Route 1",
        "route_type": "3",
    },
    {
        "route_id": "MINI_R2",
        "agency_id": "BMTC",
        "route_short_name": "M2",
        "route_long_name": "Mini Route 2",
        "route_type": "3",
    },
]

STOPS_ROWS = [
    {"stop_id": "MINI_S1", "stop_name": "Mini Stop 1", "stop_lat": "12.9000", "stop_lon": "77.5000", "zone_id": ""},
    {"stop_id": "MINI_S2", "stop_name": "Mini Stop 2", "stop_lat": "12.9100", "stop_lon": "77.5100", "zone_id": ""},
    {"stop_id": "MINI_S3", "stop_name": "Mini Stop 3", "stop_lat": "12.9200", "stop_lon": "77.5200", "zone_id": ""},
    {"stop_id": "MINI_S4", "stop_name": "Mini Stop 4", "stop_lat": "12.9300", "stop_lon": "77.5300", "zone_id": ""},
]

CALENDAR_ROWS = [
    {
        "service_id": "MINI_WEEKDAY",
        "monday": "1",
        "tuesday": "1",
        "wednesday": "1",
        "thursday": "1",
        "friday": "1",
        "saturday": "0",
        "sunday": "0",
        "start_date": "20260101",
        "end_date": "20261231",
    },
    {
        "service_id": "MINI_WEEKEND",
        "monday": "0",
        "tuesday": "0",
        "wednesday": "0",
        "thursday": "0",
        "friday": "0",
        "saturday": "1",
        "sunday": "1",
        "start_date": "20260101",
        "end_date": "20261231",
    },
]

TRIPS_ROWS = [
    {
        "trip_id": "MINI_T1",
        "route_id": "MINI_R1",
        "service_id": "MINI_WEEKDAY",
        "trip_headsign": "Mini Stop 3",
        "direction_id": "0",
        "shape_id": "",
    },
    {
        "trip_id": "MINI_T2",
        "route_id": "MINI_R2",
        "service_id": "MINI_WEEKDAY",
        "trip_headsign": "Mini Stop 4",
        "direction_id": "0",
        "shape_id": "",
    },
]

# MINI_T1: MINI_S1 -> MINI_S2 -> MINI_S3
# MINI_T2: MINI_S2 -> MINI_S3 -> MINI_S4
STOP_TIMES_ROWS = [
    {"trip_id": "MINI_T1", "stop_sequence": "1", "stop_id": "MINI_S1", "arrival_time": "08:00:00", "departure_time": "08:00:00"},
    {"trip_id": "MINI_T1", "stop_sequence": "2", "stop_id": "MINI_S2", "arrival_time": "08:05:00", "departure_time": "08:05:00"},
    {"trip_id": "MINI_T1", "stop_sequence": "3", "stop_id": "MINI_S3", "arrival_time": "08:10:00", "departure_time": "08:10:00"},
    {"trip_id": "MINI_T2", "stop_sequence": "1", "stop_id": "MINI_S2", "arrival_time": "09:00:00", "departure_time": "09:00:00"},
    {"trip_id": "MINI_T2", "stop_sequence": "2", "stop_id": "MINI_S3", "arrival_time": "09:05:00", "departure_time": "09:05:00"},
    {"trip_id": "MINI_T2", "stop_sequence": "3", "stop_id": "MINI_S4", "arrival_time": "09:10:00", "departure_time": "09:10:00"},
]

FEED_INFO_ROWS = [
    {
        "feed_publisher_name": "mini-gtfs-fixture",
        "feed_publisher_url": "http://example.invalid",
        "feed_lang": "en",
        "feed_version": "mini-1",
        "feed_start_date": "20260101",
        "feed_end_date": "20261231",
    }
]


def _csv_bytes(rows: list[dict]) -> bytes:
    """Serialize a list of dicts to CSV bytes using the first row's keys as the header."""
    buf = io.StringIO()
    fieldnames = list(rows[0].keys())
    writer = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def build_mini_gtfs(output_path: Path = OUTPUT_ZIP) -> Path:
    """Write the deterministic mini GTFS feed to `output_path` and return it."""
    files = {
        "agency.txt": AGENCY_ROWS,
        "routes.txt": ROUTES_ROWS,
        "stops.txt": STOPS_ROWS,
        "calendar.txt": CALENDAR_ROWS,
        "trips.txt": TRIPS_ROWS,
        "stop_times.txt": STOP_TIMES_ROWS,
        "feed_info.txt": FEED_INFO_ROWS,
    }

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename in sorted(files):
            info = zipfile.ZipInfo(filename, date_time=FIXED_DATE_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, _csv_bytes(files[filename]))

    return output_path


if __name__ == "__main__":
    path = build_mini_gtfs()
    print(f"Wrote mini GTFS fixture: {path}")

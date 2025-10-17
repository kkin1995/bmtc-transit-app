"""Bootstrap script to initialize DB and load GTFS."""

import sys
from pathlib import Path

from app.config import get_settings
from app.db import init_db, get_connection
from app.gtfs_bootstrap import parse_gtfs


def main():
    settings = get_settings()

    print(f"Initializing database at {settings.db_path}...")
    init_db(settings.db_path)

    # Try both gtfs.zip and bmtc.zip
    gtfs_zip = Path(settings.gtfs_path) / "gtfs.zip"
    if not gtfs_zip.exists():
        gtfs_zip = Path(settings.gtfs_path) / "bmtc.zip"
    if not gtfs_zip.exists():
        print(
            f"GTFS zip not found at {settings.gtfs_path}/gtfs.zip or {settings.gtfs_path}/bmtc.zip"
        )
        sys.exit(1)

    print(f"Parsing GTFS from {gtfs_zip}...")
    conn = get_connection(settings.db_path)
    gtfs_version = parse_gtfs(str(gtfs_zip), conn)
    conn.close()

    print(f"Bootstrap complete. GTFS version: {gtfs_version}")
    print("Segments and segment_stats populated with schedule baselines.")


if __name__ == "__main__":
    main()

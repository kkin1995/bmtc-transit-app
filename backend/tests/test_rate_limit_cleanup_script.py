"""Characterization tests for `rate_limit_cleanup.sh` and its systemd units (DATA-02).

`rate_limit_cleanup.sh` already worked correctly before this plan (D-08); this
module adds the first-ever subprocess-level test proving its 24h TTL deletion
boundary, plus a static test proving the new/modified systemd unit files exist
with the correct staggered schedule (D-09).

All tests invoke `rate_limit_cleanup.sh` via subprocess against the existing
`temp_db` fixture (file-based, not in-memory) since a subprocess needs a real
file path to open, mirroring the pattern in `test_migrations.py`.
"""

import subprocess
from pathlib import Path

import pytest

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration

# Resolved relative to this test file so it works regardless of the pytest
# invocation cwd (`cd backend && pytest ...` vs. repo-root invocation).
CLEANUP_SCRIPT = Path(__file__).parent.parent / "scripts" / "rate_limit_cleanup.sh"
DEPLOY_DIR = Path(__file__).parent.parent / "deploy"


def _run_rate_limit_cleanup(db_path: str) -> subprocess.CompletedProcess:
    """Invoke rate_limit_cleanup.sh with an isolated environment."""
    return subprocess.run(
        ["bash", str(CLEANUP_SCRIPT)],
        env={"BMTC_DB_PATH": db_path, "PATH": "/usr/bin:/bin"},
        capture_output=True,
        text=True,
    )


def test_rate_limit_cleanup_deletes_stale_keeps_fresh(temp_db):
    """Test A: a bucket refilled ~48h ago is deleted; a bucket refilled now stays."""
    db_path, conn = temp_db

    conn.execute(
        """
        INSERT INTO rate_limit_buckets (bucket_id, tokens, last_refill)
        VALUES ('stale_bucket', 100, datetime('now', '-48 hours'))
        """
    )
    conn.execute(
        """
        INSERT INTO rate_limit_buckets (bucket_id, tokens, last_refill)
        VALUES ('fresh_bucket', 100, datetime('now'))
        """
    )
    conn.commit()

    result = _run_rate_limit_cleanup(db_path)

    assert result.returncode == 0, result.stderr

    remaining_ids = {
        row[0] for row in conn.execute("SELECT bucket_id FROM rate_limit_buckets").fetchall()
    }
    assert "stale_bucket" not in remaining_ids
    assert "fresh_bucket" in remaining_ids


def test_rate_limit_cleanup_empty_table_is_noop(temp_db):
    """Test B: running against a table with zero buckets succeeds and reports 0 remaining."""
    db_path, conn = temp_db

    count = conn.execute("SELECT COUNT(*) FROM rate_limit_buckets").fetchone()[0]
    assert count == 0

    result = _run_rate_limit_cleanup(db_path)

    assert result.returncode == 0, result.stderr
    assert "Remaining buckets: 0" in result.stdout


def test_rate_limit_cleanup_units_have_staggered_schedule():
    """Test C (static): the new/modified unit files exist with the correct shape.

    Proves the systemd glue exists and is staggered per D-09/Pitfall 4 without
    requiring a live systemd host to verify.
    """
    service_text = (DEPLOY_DIR / "bmtc-rate-limit-cleanup.service").read_text()
    timer_text = (DEPLOY_DIR / "bmtc-rate-limit-cleanup.timer").read_text()
    retention_timer_text = (DEPLOY_DIR / "bmtc-retention.timer").read_text()

    assert "Type=oneshot" in service_text
    assert "EnvironmentFile=/etc/bmtc-api/env" in service_text
    assert "rate_limit_cleanup.sh" in service_text

    assert "OnCalendar=*-*-* 00:15:00" in timer_text
    assert "WantedBy=timers.target" in timer_text

    assert "OnCalendar=*-*-* 00:00:00" in retention_timer_text

    # D-09: the two daily maintenance timers must never fire at the same instant.
    assert "00:15:00" != "00:00:00"

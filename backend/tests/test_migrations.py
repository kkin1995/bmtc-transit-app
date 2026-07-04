"""Integration tests for the versioned DB migration framework (DATA-01).

Tests the `apply_migrations.sh` diff-and-apply runner and the
`schema_migrations` seeding step added to `init_db()`:
- Applying a pending migration exactly once
- Re-running the runner being a no-op once everything is applied
- Fresh-bootstrap seeding preventing double-application (RESEARCH.md Pitfall 1)
- Plain bootstrap creating an empty `schema_migrations` table

All tests invoke `apply_migrations.sh` via subprocess against the existing
`temp_db` fixture (file-based, not in-memory) since a subprocess needs a
real file path to open.
"""

import subprocess
from pathlib import Path

import pytest

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration

# Resolved relative to this test file so it works regardless of the pytest
# invocation cwd (`cd backend && pytest ...` vs. repo-root invocation).
APPLY_MIGRATIONS_SCRIPT = Path(__file__).parent.parent / "scripts" / "apply_migrations.sh"


def _run_apply_migrations(db_path: str, migrations_dir: str) -> subprocess.CompletedProcess:
    """Invoke apply_migrations.sh with an isolated environment."""
    return subprocess.run(
        ["bash", str(APPLY_MIGRATIONS_SCRIPT)],
        env={
            "BMTC_DB_PATH": db_path,
            "BMTC_MIGRATIONS_DIR": migrations_dir,
            "PATH": "/usr/bin:/bin",
        },
        capture_output=True,
        text=True,
    )


def test_apply_migrations_applies_pending_migration_exactly_once(temp_db, tmp_path):
    """Test A: a migration missing from schema_migrations is applied once."""
    db_path, conn = temp_db

    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "001_add_col_up.sql").write_text(
        "ALTER TABLE rejection_log ADD COLUMN test_note TEXT;"
    )

    result = _run_apply_migrations(db_path, str(migrations_dir))

    assert result.returncode == 0, result.stderr

    cols = {row[1] for row in conn.execute("PRAGMA table_info(rejection_log)").fetchall()}
    assert "test_note" in cols

    rows = conn.execute(
        "SELECT filename FROM schema_migrations WHERE filename = '001_add_col_up.sql'"
    ).fetchall()
    assert len(rows) == 1


def test_apply_migrations_rerun_is_noop(temp_db, tmp_path):
    """Test B: re-running the runner after all migrations applied does nothing."""
    db_path, conn = temp_db

    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "001_add_col_up.sql").write_text(
        "ALTER TABLE rejection_log ADD COLUMN test_note TEXT;"
    )

    first = _run_apply_migrations(db_path, str(migrations_dir))
    assert first.returncode == 0, first.stderr

    second = _run_apply_migrations(db_path, str(migrations_dir))
    assert second.returncode == 0, second.stderr
    assert "Applied 0" in second.stdout

    rows = conn.execute(
        "SELECT filename FROM schema_migrations WHERE filename = '001_add_col_up.sql'"
    ).fetchall()
    assert len(rows) == 1


def test_fresh_bootstrap_seeds_schema_migrations_preventing_double_apply(tmp_path, monkeypatch):
    """Test C (Pitfall 1): a fresh init_db() seeds schema_migrations from the
    resolved migrations dir so apply_migrations.sh never re-applies a change
    schema.sql already contains."""
    from app.db import init_db

    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "001_add_col_up.sql").write_text(
        "ALTER TABLE rejection_log ADD COLUMN test_note TEXT;"
    )

    db_path = str(tmp_path / "fresh.db")
    monkeypatch.setenv("BMTC_MIGRATIONS_DIR", str(migrations_dir))

    init_db(db_path)

    import sqlite3

    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT filename FROM schema_migrations WHERE filename = '001_add_col_up.sql'"
    ).fetchall()
    assert len(rows) == 1
    conn.close()

    result = _run_apply_migrations(db_path, str(migrations_dir))
    assert result.returncode == 0, result.stderr
    assert "Applied 0" in result.stdout


def test_plain_bootstrap_creates_empty_schema_migrations_table(tmp_path, monkeypatch):
    """Test D: init_db() on a fresh DB with an empty migrations dir creates
    the schema_migrations table with zero seeded rows."""
    from app.db import init_db

    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()  # empty

    db_path = str(tmp_path / "fresh_empty.db")
    monkeypatch.setenv("BMTC_MIGRATIONS_DIR", str(migrations_dir))

    init_db(db_path)

    import sqlite3

    conn = sqlite3.connect(db_path)
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ).fetchall()
    }
    assert "schema_migrations" in tables

    count = conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
    assert count == 0
    conn.close()

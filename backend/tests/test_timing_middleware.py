"""Tests for structured JSON access logging (OPS-04).

Covers:
- JsonFormatter: valid JSON output, extra-field merging, non-serializable safety
- configure_logging: root logger level + handler setup, idempotency
- TimingMiddleware: one log line per request with latency/method/path/status
- Regression: a 429 (rate-limit short-circuit) still emits an access log line,
  proving TimingMiddleware is registered outermost (RESEARCH.md Pitfall 2)
"""

import json
import logging

import pytest


# ==============================================================================
# JsonFormatter + configure_logging (Task 1)
# ==============================================================================


def _make_record(**extra) -> logging.LogRecord:
    """Build a bare LogRecord for logger "app.access" with optional extras."""
    record = logging.LogRecord(
        name="app.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request",
        args=(),
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_json_formatter_produces_valid_json_with_core_keys():
    """format() output round-trips through json.loads with the four core keys."""
    from app.logging_config import JsonFormatter

    formatter = JsonFormatter()
    output = formatter.format(_make_record())

    parsed = json.loads(output)
    assert {"timestamp", "level", "logger", "message"}.issubset(parsed.keys())
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "app.access"
    assert parsed["message"] == "request"


def test_json_formatter_includes_extra_fields():
    """extra= fields (request_latency_ms/method/path/status) surface in the parsed JSON."""
    from app.logging_config import JsonFormatter

    formatter = JsonFormatter()
    record = _make_record(
        request_latency_ms=12.3, method="GET", path="/v1/health", status=200
    )
    parsed = json.loads(formatter.format(record))

    assert parsed["request_latency_ms"] == 12.3
    assert parsed["method"] == "GET"
    assert parsed["path"] == "/v1/health"
    assert parsed["status"] == 200


def test_json_formatter_never_raises_on_non_serializable_extra():
    """A non-JSON-serializable extra value is coerced via default=str, never raises."""
    from app.logging_config import JsonFormatter

    formatter = JsonFormatter()
    record = _make_record(weird=object())

    output = formatter.format(record)
    parsed = json.loads(output)
    assert "weird" in parsed


def test_configure_logging_sets_root_level_and_single_json_handler():
    """After configure_logging(), root is at INFO with exactly one JsonFormatter handler."""
    from app.logging_config import JsonFormatter, configure_logging

    configure_logging()

    root = logging.getLogger()
    assert root.level == logging.INFO
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonFormatter)


def test_configure_logging_is_idempotent():
    """Calling configure_logging() twice still leaves exactly one handler."""
    from app.logging_config import configure_logging

    configure_logging()
    configure_logging()

    root = logging.getLogger()
    assert len(root.handlers) == 1


# ==============================================================================
# TimingMiddleware wired outermost in main.py (Task 2)
# ==============================================================================


def test_health_request_emits_one_app_access_log_record(client, caplog):
    """GET /v1/health emits exactly one INFO record on logger app.access with
    the four expected extras."""
    with caplog.at_level(logging.INFO, logger="app.access"):
        response = client.get("/v1/health")

    assert response.status_code == 200

    records = [r for r in caplog.records if r.name == "app.access"]
    assert len(records) == 1

    record = records[0]
    assert record.method == "GET"
    assert record.path == "/v1/health"
    assert record.status == 200
    assert isinstance(record.request_latency_ms, float)
    assert record.request_latency_ms >= 0


def test_access_log_path_excludes_query_string_and_secrets(client, caplog):
    """The logged path is request.url.path only — never the query string."""
    with caplog.at_level(logging.INFO, logger="app.access"):
        client.get("/v1/health?token=should-not-appear")

    record = next(r for r in caplog.records if r.name == "app.access")
    assert record.path == "/v1/health"
    assert "token" not in record.path
    assert "should-not-appear" not in record.path


@pytest.fixture
def rate_limited_access_client(temp_db, monkeypatch):
    """TestClient with rate limiting enabled and a 1/hour cap, plus a valid
    ROUTE1/STOP_A->STOP_B segment seeded, so a second POST /v1/ride_summary
    always trips a 429 — used to prove TimingMiddleware is outermost
    (regression for RESEARCH.md Pitfall 2).

    Mirrors test_rate_limit.py's setup_rate_limit_segment fixture: seeds via
    app.db.get_connection() (used by the app itself, which does not enforce
    PRAGMA foreign_keys, unlike the raw sqlite3.connect() in temp_db) rather
    than db_with_test_segment (which enables FKs and requires routes/stops
    rows that this test does not need).
    """
    monkeypatch.setenv("BMTC_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("BMTC_RATE_LIMIT_PER_HOUR", "1")

    from app.config import get_settings
    from app.db import get_connection
    from app.main import app
    from fastapi.testclient import TestClient

    get_settings.cache_clear()
    settings = get_settings()
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
            ("ROUTE1", 0, "STOP_A", "STOP_B"),
        )
        conn.commit()

    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


def test_429_short_circuit_still_emits_access_log(
    rate_limited_access_client, sample_ride_data, auth_headers, caplog
):
    """A request rejected by RateLimitMiddleware with 429 still produces an
    app.access log record with status=429 — proving TimingMiddleware wraps
    RateLimitMiddleware (i.e. is registered LAST/outermost)."""
    client = rate_limited_access_client
    payload = sample_ride_data()

    with caplog.at_level(logging.INFO, logger="app.access"):
        first = client.post("/v1/ride_summary", json=payload, headers=auth_headers)
        assert first.status_code == 200

        second = client.post("/v1/ride_summary", json=payload, headers=auth_headers)
        assert second.status_code == 429

    statuses = [
        r.status
        for r in caplog.records
        if r.name == "app.access" and hasattr(r, "status")
    ]
    assert 429 in statuses

"""Unit tests for learning algorithms.

These are pure unit tests that test mathematical functions without
database or API dependencies. They use pytest markers for organization.
"""

import inspect
import pytest
import statistics
import time

# Mark all tests in this module as unit tests
pytestmark = pytest.mark.unit
from app.learning import (
    update_welford,
    compute_variance,
    is_outlier,
    compute_blend_weight,
    compute_blended_mean,
    compute_percentiles,
    compute_percentiles_robust,
    update_segment_stats,
)


def test_welford_single_update():
    """Test single Welford update."""
    n, mean, m2 = 0, 0.0, 0.0
    n, mean, m2 = update_welford(n, mean, m2, 100.0)

    assert n == 1
    assert mean == 100.0
    assert m2 == 0.0


def test_welford_convergence():
    """Test Welford converges to correct mean and variance."""
    n, mean, m2 = 0, 0.0, 0.0
    samples = [100, 110, 90, 105, 95]

    for x in samples:
        n, mean, m2 = update_welford(n, mean, m2, x)

    assert n == 5
    assert abs(mean - 100.0) < 0.01  # Mean should be ~100
    variance = compute_variance(m2, n)
    assert variance > 0  # Should have non-zero variance


def test_outlier_detection():
    """Test outlier detection with >3σ threshold."""
    mean = 100.0
    variance = 100.0  # σ=10
    n = 10

    # Within 3σ: not an outlier
    assert not is_outlier(130.0, mean, variance, n)

    # Beyond 3σ: outlier
    assert is_outlier(140.0, mean, variance, n)

    # n<=5: never reject
    assert not is_outlier(200.0, mean, variance, n=5)


def test_blend_weight():
    """Test blend weight w=n/(n+n0)."""
    # At n=0, w=0 (full schedule)
    assert compute_blend_weight(0) == 0.0

    # At n=20 (assuming n0=20), w=0.5
    assert compute_blend_weight(20) == pytest.approx(0.5)

    # At n=200, w~0.9
    assert compute_blend_weight(200) > 0.9


def test_blended_mean():
    """Test blended mean computation."""
    welford_mean = 120.0
    schedule_mean = 100.0

    # At n=0, should be pure schedule
    blended = compute_blended_mean(welford_mean, schedule_mean, n=0)
    assert blended == schedule_mean

    # At n=20 (n0=20), should be 50/50
    blended = compute_blended_mean(welford_mean, schedule_mean, n=20)
    assert blended == pytest.approx(110.0)


def test_percentiles():
    """Test P50 and P90 computation."""
    mean = 100.0
    variance = 100.0  # σ=10

    p50, p90 = compute_percentiles(mean, variance)
    assert p50 == 100.0  # P50 = mean
    assert p90 == pytest.approx(112.8)  # mean + 1.28*10


def test_percentiles_robust_low_n():
    """Test robust percentiles with low-n protection."""
    mean = 100.0
    variance = 100.0  # σ=10
    schedule_mean = 100.0

    # n < 8: should trigger low_n_warning and wider band
    p50, p90, low_n_warning = compute_percentiles_robust(
        mean, variance, n=5, schedule_mean=schedule_mean
    )
    assert p50 == 100.0
    assert p90 == pytest.approx(115.0)  # mean + 1.5*10
    assert low_n_warning is True

    # n >= 8: normal approximation
    p50, p90, low_n_warning = compute_percentiles_robust(
        mean, variance, n=10, schedule_mean=schedule_mean
    )
    assert p50 == 100.0
    assert p90 == pytest.approx(112.8)  # mean + 1.28*10
    assert low_n_warning is False


def test_compute_variance_uses_sample_formula_not_population():
    """BUGFIX-05: compute_variance must return m2/(n-1), not m2/n, for n>=2."""
    samples = [100.0, 110.0, 90.0, 105.0, 95.0, 102.0, 98.0, 107.0, 93.0, 101.0]  # n=10
    n, mean, m2 = 0, 0.0, 0.0
    for x in samples:
        n, mean, m2 = update_welford(n, mean, m2, x)

    sample_variance = compute_variance(m2, n)
    expected_sample_variance = statistics.variance(samples)  # ddof=1, i.e. n-1
    wrong_population_variance = statistics.pvariance(samples)  # ddof=0, i.e. n

    assert sample_variance == pytest.approx(expected_sample_variance, rel=1e-9)
    assert sample_variance != pytest.approx(wrong_population_variance, rel=1e-9)
    assert sample_variance > wrong_population_variance  # sample formula always >= population


def test_compute_variance_guards_n_less_than_2():
    """Guard must survive the divisor change — n=0 and n=1 both return 0.0."""
    assert compute_variance(m2=0.0, n=0) == 0.0
    assert compute_variance(m2=0.0, n=1) == 0.0
    assert compute_variance(m2=50.0, n=1) == 0.0  # m2 nonzero but n<2 still guarded


def test_p90_wider_with_sample_variance_than_population_variance():
    """ROADMAP Phase 2 criterion #2: sample-variance P90 must be strictly wider than population-variance P90."""
    samples = [100.0, 110.0, 90.0, 105.0, 95.0, 102.0, 98.0, 107.0, 93.0, 101.0]  # n=10
    n, mean, m2 = 0, 0.0, 0.0
    for x in samples:
        n, mean, m2 = update_welford(n, mean, m2, x)

    population_variance = m2 / n  # the OLD (buggy) formula, inlined for comparison
    sample_variance = m2 / (n - 1)  # the NEW (correct) formula

    _, p90_old, _ = compute_percentiles_robust(mean, population_variance, n, schedule_mean=mean)
    _, p90_new, _ = compute_percentiles_robust(mean, sample_variance, n, schedule_mean=mean)

    assert p90_new > p90_old  # sample-variance P90 bound must be strictly wider


def _insert_bare_segment(conn, route_id, from_stop_id="STOP_A", to_stop_id="STOP_B"):
    """Insert a segments row, satisfying FK dependencies on routes/stops/time_bins first."""
    conn.execute(
        "INSERT INTO routes (route_id, route_type) VALUES (?, 3)",
        (route_id,),
    )
    for stop_id in (from_stop_id, to_stop_id):
        conn.execute(
            "INSERT OR IGNORE INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, 0.0, 0.0)",
            (stop_id, stop_id),
        )
    for bin_id in (0, 5):
        conn.execute(
            "INSERT OR IGNORE INTO time_bins (bin_id, weekday_type, hour_start, minute_start) VALUES (?, 0, 0, 0)",
            (bin_id,),
        )
    conn.execute(
        "INSERT INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        (route_id, 0, from_stop_id, to_stop_id),
    )
    conn.commit()
    return conn.execute(
        "SELECT segment_id FROM segments WHERE route_id=?", (route_id,)
    ).fetchone()[0]


def test_update_segment_stats_seeds_new_bin_and_accepts(in_memory_db):
    """BUGFIX-04: a never-seen (segment_id, bin_id) must seed a row and accept the observation."""
    conn = in_memory_db
    segment_id = _insert_bare_segment(conn, "ROUTE_SEED")

    # Existing segment_stats row for bin 0 with a known schedule_mean
    conn.execute(
        """
        INSERT INTO segment_stats (segment_id, bin_id, n, welford_mean, welford_m2, schedule_mean)
        VALUES (?, 0, 0, 0.0, 0.0, 300.0)
        """,
        (segment_id,),
    )
    conn.commit()

    accepted, reason = update_segment_stats(
        conn, segment_id, bin_id=5, duration_sec=310.0, mapmatch_conf=1.0
    )

    assert (accepted, reason) == (True, None)

    row = conn.execute(
        "SELECT n, welford_mean, schedule_mean FROM segment_stats WHERE segment_id=? AND bin_id=5",
        (segment_id,),
    ).fetchone()
    assert row is not None
    n, welford_mean, schedule_mean = row
    assert n == 1
    assert welford_mean == pytest.approx(310.0)
    assert schedule_mean == pytest.approx(300.0)  # seeded from AVG of existing bin


def test_seed_falls_back_to_zero_when_no_existing_bins(in_memory_db):
    """BUGFIX-04/D-10: with zero existing segment_stats rows, seed schedule_mean falls back to 0.0."""
    conn = in_memory_db
    segment_id = _insert_bare_segment(conn, "ROUTE_SEED_EMPTY")

    accepted, reason = update_segment_stats(
        conn, segment_id, bin_id=5, duration_sec=250.0, mapmatch_conf=1.0
    )

    assert (accepted, reason) == (True, None)

    row = conn.execute(
        "SELECT n, schedule_mean FROM segment_stats WHERE segment_id=? AND bin_id=5",
        (segment_id,),
    ).fetchone()
    assert row is not None
    n, schedule_mean = row
    assert n == 1
    assert schedule_mean == 0.0


def test_seed_row_is_not_falsely_rejected_as_outlier(in_memory_db):
    """BUGFIX-04: the first observation on a freshly seeded n=0 row must never be rejected as an outlier."""
    conn = in_memory_db
    segment_id = _insert_bare_segment(conn, "ROUTE_SEED_OUTLIER")

    accepted, reason = update_segment_stats(
        conn, segment_id, bin_id=5, duration_sec=9999.0, mapmatch_conf=1.0
    )

    assert (accepted, reason) == (True, None)


def test_update_ema_and_compute_time_based_alpha_and_is_stale_are_removed():
    """LEARN-01 D-03/D-07: EMA and staleness dead code must no longer exist in app.learning."""
    import app.learning as learning_module

    assert not hasattr(learning_module, "update_ema")
    assert not hasattr(learning_module, "compute_time_based_alpha")
    assert not hasattr(learning_module, "is_stale")


def test_ema_columns_not_written_by_update_segment_stats():
    """LEARN-01 D-02: update_segment_stats must not reference EMA columns or missing_stats."""
    source = inspect.getsource(update_segment_stats)

    assert "ema_mean" not in source
    assert "ema_var" not in source
    assert "update_ema(" not in source
    assert "compute_time_based_alpha(" not in source
    assert "missing_stats" not in source

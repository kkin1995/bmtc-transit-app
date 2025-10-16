"""Learning algorithms: Welford, EMA, schedule blend, outlier detection."""
import logging
import math
import time
from typing import Optional, Tuple

from app.config import get_settings


logger = logging.getLogger(__name__)


def update_welford(n: int, mean: float, m2: float, x: float) -> Tuple[int, float, float]:
    """Update Welford running statistics.

    Args:
        n: Current sample count
        mean: Current mean
        m2: Current M2 (sum of squared differences)
        x: New observation

    Returns:
        (n', mean', m2')
    """
    n_new = n + 1
    delta = x - mean
    mean_new = mean + delta / n_new
    delta2 = x - mean_new
    m2_new = m2 + delta * delta2
    return n_new, mean_new, m2_new


def update_ema(mean: float, var: float, x: float, alpha: float) -> Tuple[float, float]:
    """Update exponential moving average and variance.

    Args:
        mean: Current EMA mean
        var: Current EMA variance
        x: New observation
        alpha: Smoothing factor (typically 0.1)

    Returns:
        (mean', var')
    """
    mean_new = alpha * x + (1 - alpha) * mean
    var_new = alpha * (x - mean_new) ** 2 + (1 - alpha) * var
    return mean_new, var_new


def compute_variance(m2: float, n: int) -> float:
    """Compute sample variance from Welford M2."""
    if n < 2:
        return 0.0
    return m2 / n


def is_outlier(x: float, mean: float, variance: float, n: int) -> bool:
    """Detect if observation is an outlier (>3σ from mean).

    Only reject if n > 5 (enough samples to trust statistics).
    """
    if n <= 5:
        return False

    std_dev = math.sqrt(variance)
    if std_dev < 1e-6:  # Avoid division by zero
        return False

    return abs(x - mean) > 3 * std_dev


def compute_blend_weight(n: int) -> float:
    """Compute blend weight w = n / (n + n0).

    n0 is configured via settings.
    """
    settings = get_settings()
    n0 = settings.n0
    return n / (n + n0)


def compute_blended_mean(welford_mean: float, schedule_mean: float, n: int) -> float:
    """Compute blended mean: w * welford_mean + (1-w) * schedule_mean."""
    w = compute_blend_weight(n)
    return w * welford_mean + (1 - w) * schedule_mean


def compute_percentiles(mean: float, variance: float) -> Tuple[float, float]:
    """Compute P50 and P90 assuming normal distribution.

    P50 = mean
    P90 = mean + 1.28 * sigma
    """
    p50 = mean
    std_dev = math.sqrt(variance)
    p90 = mean + 1.28 * std_dev
    return p50, p90


def compute_percentiles_robust(
    mean: float,
    variance: float,
    n: int,
    schedule_mean: float
) -> Tuple[float, float, bool]:
    """Compute p50/p90 with low-n protection.

    Args:
        mean: Blended mean estimate
        variance: Variance estimate
        n: Sample count
        schedule_mean: Fallback schedule baseline

    Returns:
        (p50, p90, low_n_warning)
        low_n_warning=True when n < 8 (quantiles unreliable)
    """
    low_n_warning = n < 8

    if n < 8:
        # Fallback: Use wider confidence bands for safety
        std_dev = math.sqrt(variance) if variance > 0 else schedule_mean * 0.1
        p50 = mean
        p90 = mean + 1.5 * std_dev  # Wider band for safety at low n
        return p50, p90, low_n_warning
    else:
        # Normal approximation (acceptable at n≥8)
        std_dev = math.sqrt(variance)
        p50 = mean
        p90 = mean + 1.28 * std_dev
        return p50, p90, low_n_warning


def compute_time_based_alpha(last_update: Optional[int], half_life_days: int) -> float:
    """Compute time-based alpha from half-life.

    Uses exponential decay: α(Δt) = 1 - exp(-ln(2) · Δt / half_life)

    Args:
        last_update: Unix timestamp of last update (None for first observation)
        half_life_days: Half-life period in days (default 30)

    Returns:
        alpha in [0, 1] based on time elapsed
        Returns 0.1 if last_update is None (first observation)
    """
    if last_update is None:
        return 0.1  # Default for first observation

    elapsed_sec = time.time() - last_update
    elapsed_days = elapsed_sec / 86400

    # α = 1 - exp(-ln(2) * Δt / half_life)
    # Capped at 1.0 to prevent overflow on very old data
    alpha = 1.0 - math.exp(-0.693147 * elapsed_days / half_life_days)
    return min(alpha, 1.0)


def is_stale(last_update: Optional[int]) -> bool:
    """Check if data is stale (>90 days old)."""
    if last_update is None:
        return True

    settings = get_settings()
    threshold_sec = settings.stale_threshold_days * 24 * 3600
    return (int(time.time()) - last_update) > threshold_sec


def update_segment_stats(
    conn,
    segment_id: int,
    bin_id: int,
    duration_sec: float
) -> bool:
    """Update segment_stats with new observation.

    Returns True if accepted, False if rejected as outlier.
    """
    cursor = conn.cursor()

    # Fetch current stats (include last_update for time-based alpha)
    cursor.execute(
        """
        SELECT n, welford_mean, welford_m2, ema_mean, ema_var, schedule_mean, last_update
        FROM segment_stats
        WHERE segment_id = ? AND bin_id = ?
        """,
        (segment_id, bin_id)
    )
    row = cursor.fetchone()

    if row is None:
        logger.warning(f"segment_stats not found for segment_id={segment_id}, bin_id={bin_id}")
        return False

    n, welford_mean, welford_m2, ema_mean, ema_var, schedule_mean, last_update = row

    # Check for outlier
    variance = compute_variance(welford_m2, n)
    if is_outlier(duration_sec, welford_mean, variance, n):
        logger.info(
            f"Outlier rejected: segment_id={segment_id}, bin_id={bin_id}, "
            f"duration={duration_sec:.1f}, mean={welford_mean:.1f}, std={math.sqrt(variance):.1f}"
        )
        return False

    # Update Welford
    n_new, welford_mean_new, welford_m2_new = update_welford(n, welford_mean, welford_m2, duration_sec)

    # Update EMA with time-based alpha (prevents stale/volatile estimates)
    settings = get_settings()
    alpha = compute_time_based_alpha(last_update, settings.half_life_days)
    ema_mean_new, ema_var_new = update_ema(ema_mean, ema_var, duration_sec, alpha)

    # Write back
    cursor.execute(
        """
        UPDATE segment_stats
        SET n = ?, welford_mean = ?, welford_m2 = ?, ema_mean = ?, ema_var = ?, last_update = ?
        WHERE segment_id = ? AND bin_id = ?
        """,
        (n_new, welford_mean_new, welford_m2_new, ema_mean_new, ema_var_new, int(time.time()), segment_id, bin_id)
    )
    conn.commit()
    return True

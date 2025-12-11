/**
 * Segment Builder
 *
 * Pure functions for converting stop-level GPS events (with enter/leave timestamps)
 * into segments for ride summary submission to the backend API.
 *
 * This module is pure: no network calls, no global state, no side effects.
 */

import type { RideSegment } from '@/src/api/types';

/**
 * StopEvent represents a visit to a stop during a trip
 *
 * Produced by on-device GPS tracking logic when the user enters
 * and exits a stop's geofence (e.g., 50m radius circle).
 */
export interface StopEvent {
  /**
   * GTFS stop_id for this route+direction
   */
  stopId: string;

  /**
   * Timestamp when user enters the stop's geofence (50m circle)
   */
  tEnter: Date;

  /**
   * Timestamp when user exits the stop's geofence
   */
  tLeave: Date;
}

/**
 * Convert ordered stop events into ride segments for API submission
 *
 * This function implements the following conventions:
 *
 * **duration_sec**: Time between consecutive stop enter times
 * - Calculated as: `events[k+1].tEnter - events[k].tEnter` in seconds
 * - Rationale: Captures total travel time from stop to stop, including dwell
 *
 * **dwell_sec**: Time spent at the FROM stop
 * - Calculated as: `events[k].tLeave - events[k].tEnter` in seconds
 * - Rationale: Measures how long the bus waited at the stop
 *
 * **observed_at_utc**: Timestamp when the TO stop was reached
 * - Uses: `events[k+1].tEnter` converted to ISO-8601 UTC string
 * - Rationale: Records when the observation was completed
 *
 * **mapmatch_conf**: Map-matching confidence score
 * - Uses the provided `mapmatchConf` argument for all segments
 * - Rationale: Caller determines confidence based on GPS quality
 *
 * @param events - Ordered array of stop events in travel order along one route/direction
 * @param mapmatchConf - Map-matching confidence score (0.0 to 1.0)
 * @returns Array of ride segments ready for API submission
 *
 * @example
 * ```typescript
 * const events: StopEvent[] = [
 *   {
 *     stopId: '20558',
 *     tEnter: new Date('2025-12-11T10:00:00Z'),
 *     tLeave: new Date('2025-12-11T10:01:30Z'),
 *   },
 *   {
 *     stopId: '29374',
 *     tEnter: new Date('2025-12-11T10:06:30Z'),
 *     tLeave: new Date('2025-12-11T10:08:00Z'),
 *   },
 * ];
 *
 * const segments = buildSegmentsFromStopEvents(events, 0.85);
 * // Returns: [
 * //   {
 * //     from_stop_id: '20558',
 * //     to_stop_id: '29374',
 * //     duration_sec: 390,      // 6.5 minutes
 * //     dwell_sec: 90,          // 1.5 minutes at stop
 * //     observed_at_utc: '2025-12-11T10:06:30.000Z',
 * //     mapmatch_conf: 0.85,
 * //   }
 * // ]
 * ```
 */
export function buildSegmentsFromStopEvents(
  events: StopEvent[],
  mapmatchConf: number
): RideSegment[] {
  // Edge case: need at least 2 events to form 1 segment
  if (events.length < 2) {
    return [];
  }

  const segments: RideSegment[] = [];

  // Build segments from consecutive event pairs
  for (let i = 0; i < events.length - 1; i++) {
    const fromEvent = events[i];
    const toEvent = events[i + 1];

    // Calculate duration: time between consecutive tEnter timestamps
    const durationMs = toEvent.tEnter.getTime() - fromEvent.tEnter.getTime();
    const durationSec = durationMs / 1000;

    // Calculate dwell: time spent at FROM stop
    const dwellMs = fromEvent.tLeave.getTime() - fromEvent.tEnter.getTime();
    const dwellSec = dwellMs / 1000;

    // Format observed_at_utc as ISO-8601 UTC string
    const observedAtUtc = toEvent.tEnter.toISOString();

    segments.push({
      from_stop_id: fromEvent.stopId,
      to_stop_id: toEvent.stopId,
      duration_sec: durationSec,
      dwell_sec: dwellSec,
      observed_at_utc: observedAtUtc,
      mapmatch_conf: mapmatchConf,
    });
  }

  return segments;
}

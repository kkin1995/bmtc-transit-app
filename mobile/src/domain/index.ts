/**
 * Domain module exports
 *
 * Business logic and pure functions for the BMTC transit app.
 * This module contains domain-specific logic that is independent
 * of UI, API, or framework concerns.
 */

export { buildSegmentsFromStopEvents } from './segments';
export type { StopEvent } from './segments';

export {
  haversineDistanceMeters,
  findNearestStop,
  updateStopProximityState,
} from './geo';
export type { LatLon, StopWithCoords, ProximityState } from './geo';

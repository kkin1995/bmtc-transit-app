/**
 * Geospatial Utilities
 *
 * Pure functions for distance calculation and proximity detection used in
 * GPS-based stop detection and ride tracking.
 *
 * This module provides:
 * - Haversine distance calculation for spherical Earth (accuracy ~0.5% for most distances)
 * - Nearest stop finding from GPS coordinates
 * - Proximity state tracking for stop enter/exit detection
 *
 * All functions are pure (no side effects) and tested for accuracy with
 * real-world Bangalore landmarks and edge cases (poles, date line, equator).
 *
 * @example
 * ```typescript
 * import { haversineDistanceMeters, findNearestStop, updateStopProximityState } from '@/src/domain/geo';
 *
 * // Calculate distance between two points
 * const mgRoad = { lat: 12.9756, lon: 77.6064 };
 * const station = { lat: 12.9779, lon: 77.5717 };
 * const distance = haversineDistanceMeters(mgRoad, station); // ~3400 meters
 *
 * // Find nearest stop from current position
 * const position = { lat: 12.9716, lon: 77.5946 };
 * const stops = [
 *   { stopId: 'STOP_A', coords: { lat: 12.9725, lon: 77.5946 } },
 *   { stopId: 'STOP_B', coords: { lat: 12.9800, lon: 77.5800 } },
 * ];
 * const nearest = findNearestStop(position, stops);
 * // Returns: { stopId: 'STOP_A', distanceMeters: 100 }
 *
 * // Track stop proximity state transitions
 * let state: ProximityState = { kind: 'outside' };
 * state = updateStopProximityState(state, 'STOP_A', 30, 50); // Enter radius
 * // Returns: { kind: 'inside', stopId: 'STOP_A' }
 * ```
 */

// Constants
const EARTH_RADIUS_METERS = 6371000;

/**
 * Geographic coordinate (latitude/longitude pair)
 */
export interface LatLon {
  /**
   * Latitude in decimal degrees (-90 to 90)
   * - Positive = North of Equator
   * - Negative = South of Equator
   */
  lat: number;

  /**
   * Longitude in decimal degrees (-180 to 180)
   * - Positive = East of Prime Meridian
   * - Negative = West of Prime Meridian
   */
  lon: number;
}

/**
 * Stop with geographic coordinates
 */
export interface StopWithCoords {
  /**
   * GTFS stop_id
   */
  stopId: string;

  /**
   * Stop coordinates
   */
  coords: LatLon;
}

/**
 * Proximity state for stop detection
 *
 * Tracks whether the device is inside or outside a stop's proximity radius.
 * Used to detect stop enter/exit events for ride tracking.
 */
export type ProximityState =
  | { kind: 'outside' }
  | { kind: 'inside'; stopId: string };

/**
 * Calculate great-circle distance between two points using Haversine formula
 *
 * The Haversine formula calculates the shortest distance over the Earth's surface
 * (great-circle distance), treating Earth as a sphere with radius 6371 km.
 *
 * Formula:
 * ```
 * a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
 * c = 2 × atan2(√a, √(1−a))
 * d = R × c
 * ```
 *
 * Where:
 * - φ = latitude in radians
 * - λ = longitude in radians
 * - R = Earth radius (6371000 meters)
 *
 * Accuracy: ~0.5% error for most distances (assumes spherical Earth)
 *
 * @param a - First coordinate
 * @param b - Second coordinate
 * @returns Distance in meters (always non-negative)
 *
 * @example
 * ```typescript
 * const mgRoad = { lat: 12.9756, lon: 77.6064 };
 * const station = { lat: 12.9779, lon: 77.5717 };
 * const distance = haversineDistanceMeters(mgRoad, station);
 * // Returns: ~3400 meters
 * ```
 */
export function haversineDistanceMeters(a: LatLon, b: LatLon): number {
  // Convert degrees to radians
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);

  // Haversine formula
  const sinDeltaLat = Math.sin(deltaLat / 2);
  const sinDeltaLon = Math.sin(deltaLon / 2);
  const haversineA =
    sinDeltaLat * sinDeltaLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLon * sinDeltaLon;

  const c = 2 * Math.atan2(Math.sqrt(haversineA), Math.sqrt(1 - haversineA));
  const distance = EARTH_RADIUS_METERS * c;

  return distance;
}

/**
 * Find the nearest stop from current position
 *
 * Scans all provided stops and returns the one with minimum distance.
 * Uses Haversine formula for accurate great-circle distance calculation.
 *
 * Tie-breaking: Returns first stop in array if multiple stops are equidistant.
 *
 * @param position - Current GPS position
 * @param stops - Array of stops with coordinates
 * @returns Nearest stop with distance, or null if stops array is empty
 *
 * @example
 * ```typescript
 * const position = { lat: 12.9716, lon: 77.5946 };
 * const stops = [
 *   { stopId: 'STOP_A', coords: { lat: 12.9725, lon: 77.5946 } }, // ~100m
 *   { stopId: 'STOP_B', coords: { lat: 12.9800, lon: 77.5800 } }, // ~1000m
 * ];
 * const nearest = findNearestStop(position, stops);
 * // Returns: { stopId: 'STOP_A', distanceMeters: 100 }
 * ```
 */
export function findNearestStop(
  position: LatLon,
  stops: StopWithCoords[]
): { stopId: string; distanceMeters: number } | null {
  // Handle empty array
  if (stops.length === 0) {
    return null;
  }

  // Find stop with minimum distance
  let nearestStop = stops[0];
  let minDistance = haversineDistanceMeters(position, nearestStop.coords);

  for (let i = 1; i < stops.length; i++) {
    const distance = haversineDistanceMeters(position, stops[i].coords);
    if (distance < minDistance) {
      minDistance = distance;
      nearestStop = stops[i];
    }
  }

  return {
    stopId: nearestStop.stopId,
    distanceMeters: minDistance,
  };
}

/**
 * Update proximity state based on current distance to stop
 *
 * Implements state machine for stop enter/exit detection:
 *
 * State transitions:
 * - `outside` + distance < radius → `inside` (enter stop)
 * - `outside` + distance >= radius → `outside` (stay outside)
 * - `inside` + distance >= radius → `outside` (leave stop)
 * - `inside` + distance < radius + same stopId → `inside` (stay inside)
 * - `inside` + distance < radius + different stopId → `inside` with new stopId (switch stops)
 *
 * Boundary behavior:
 * - `distance < radius` is strictly less than (boundary is exclusive)
 * - If `distance === radius`, considered outside
 *
 * @param previous - Current proximity state
 * @param stopId - Stop being checked for proximity
 * @param distanceMeters - Distance to the stop in meters
 * @param radiusMeters - Proximity radius threshold in meters
 * @returns Updated proximity state (new object, previous state unchanged)
 *
 * @example
 * ```typescript
 * // Start outside all stops
 * let state: ProximityState = { kind: 'outside' };
 *
 * // Approach stop (100m, 80m, 60m) - still outside
 * state = updateStopProximityState(state, 'STOP_A', 100, 50);
 * // Returns: { kind: 'outside' }
 *
 * // Enter stop (40m < 50m radius)
 * state = updateStopProximityState(state, 'STOP_A', 40, 50);
 * // Returns: { kind: 'inside', stopId: 'STOP_A' }
 *
 * // Dwell at stop (20m, 10m) - stay inside
 * state = updateStopProximityState(state, 'STOP_A', 20, 50);
 * // Returns: { kind: 'inside', stopId: 'STOP_A' }
 *
 * // Leave stop (60m >= 50m radius)
 * state = updateStopProximityState(state, 'STOP_A', 60, 50);
 * // Returns: { kind: 'outside' }
 * ```
 */
export function updateStopProximityState(
  previous: ProximityState,
  stopId: string,
  distanceMeters: number,
  radiusMeters: number
): ProximityState {
  // Special case: distance === 0 means exact match (always inside)
  // Otherwise: strictly less than radius (boundary is exclusive)
  const isInside = distanceMeters === 0 || distanceMeters < radiusMeters;

  if (previous.kind === 'outside') {
    // Transition: outside → inside (if within radius)
    if (isInside) {
      return { kind: 'inside', stopId };
    } else {
      return { kind: 'outside' };
    }
  } else {
    // previous.kind === 'inside'
    // Transition: inside → outside (if outside radius)
    // OR switch to new stop (if inside different stop's radius)
    if (!isInside) {
      return { kind: 'outside' };
    } else {
      // Inside new stop's radius (same or different stopId)
      return { kind: 'inside', stopId };
    }
  }
}

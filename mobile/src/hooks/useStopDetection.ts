/**
 * useStopDetection Hook
 *
 * GPS-based stop detection for active trip sessions.
 * Watches location stream and detects when device enters/leaves stop proximity radius.
 *
 * Responsibilities:
 * - Request location permissions
 * - Subscribe to GPS location updates when active
 * - Detect stop enter/exit events using geospatial utilities
 * - Call recordStopVisit(stopId, tEnter, tLeave) for each complete visit
 * - Handle stop switching (entering new stop while inside another)
 * - Close visit immediately on deactivation while inside
 * - Manage errors (permissions, location service failures)
 *
 * State Machine (per stop):
 * - outside → inside: Store entry timestamp, update lastStopId
 * - inside → outside: Call recordStopVisit(stopId, tEnter, tLeave), reset lastStopId
 * - inside → inside (different stop): Close old visit, open new visit
 *
 * Implementation:
 * - Uses refs for internal state (avoid re-renders on every GPS update)
 * - Only updates React state for: isRunning, lastStopId, error
 * - Cleans up subscription on unmount or deactivation
 * - Handles empty stops array gracefully
 */

import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';
import type { StopWithCoords, ProximityState } from '@/src/domain/geo';
import { findNearestStop, updateStopProximityState } from '@/src/domain/geo';

/**
 * Hook parameters
 */
export interface UseStopDetectionParams {
  /**
   * Enable/disable stop detection
   * When true: starts location watching
   * When false: stops location watching and closes any open visit
   */
  active: boolean;

  /**
   * GTFS route_id for the current trip
   */
  routeId: string;

  /**
   * GTFS direction_id (0 or 1)
   */
  directionId: number;

  /**
   * Array of stops to detect
   * Hook processes empty arrays gracefully (no stop detection, but still manages subscription)
   */
  stops: StopWithCoords[];

  /**
   * Callback invoked when device completes a stop visit
   * Called with: stopId, entry timestamp, exit timestamp
   * Always guaranteed: tEnter < tLeave
   */
  recordStopVisit: (stopId: string, tEnter: Date, tLeave: Date) => void;

  /**
   * Proximity radius in meters (default: 50)
   * Device is "inside" stop when distance < radius
   * Boundary is exclusive: distance === radius is "outside"
   */
  radiusMeters?: number;
}

/**
 * Hook return value
 */
export interface UseStopDetectionReturn {
  /**
   * Whether location watching is active
   * true = subscription active, false = inactive or error
   */
  isRunning: boolean;

  /**
   * Currently visited stop ID (inside radius), or null if outside all stops
   * Updates when entering/leaving stops
   */
  lastStopId: string | null;

  /**
   * Error from permission/location service, or null if no error
   */
  error: Error | null;
}

/**
 * useStopDetection - GPS-based stop proximity detection
 *
 * @example
 * ```tsx
 * const { isRunning, lastStopId, error } = useStopDetection({
 *   active: session !== null,
 *   routeId: session.route_id,
 *   directionId: session.direction_id,
 *   stops: routeStops,
 *   recordStopVisit: (stopId, tEnter, tLeave) => {
 *     console.log(`Visited ${stopId} from ${tEnter} to ${tLeave}`);
 *   },
 *   radiusMeters: 50,
 * });
 *
 * if (error) {
 *   return <Text>Location error: {error.message}</Text>;
 * }
 *
 * return (
 *   <View>
 *     <Text>Tracking: {isRunning ? 'Yes' : 'No'}</Text>
 *     <Text>Current Stop: {lastStopId || 'None'}</Text>
 *   </View>
 * );
 * ```
 */
export function useStopDetection(
  params: UseStopDetectionParams
): UseStopDetectionReturn {
  const {
    active,
    routeId,
    directionId,
    stops,
    recordStopVisit,
    radiusMeters = 50,
  } = params;

  // React state (triggers re-renders)
  const [isRunning, setIsRunning] = useState(false);
  const [lastStopId, setLastStopId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs for internal state (no re-renders)
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const proximityStateRef = useRef<ProximityState>({ kind: 'outside' });
  const currentStopIdRef = useRef<string | null>(null);
  const tEnterRef = useRef<Date | null>(null);

  // Effect: Manage location subscription lifecycle
  useEffect(() => {
    // If not active, ensure cleanup and early exit
    if (!active) {
      // If currently inside a stop, close the visit immediately
      if (currentStopIdRef.current && tEnterRef.current) {
        const stopId = currentStopIdRef.current;
        const tEnter = tEnterRef.current;
        const tLeave = new Date();

        // Call recordStopVisit to close the visit
        recordStopVisit(stopId, tEnter, tLeave);

        // Reset internal state
        currentStopIdRef.current = null;
        tEnterRef.current = null;
        proximityStateRef.current = { kind: 'outside' };
        setLastStopId(null);
      }

      // Cleanup subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }

      setIsRunning(false);
      return;
    }

    // Active = true: Start location watching
    let mounted = true;

    const startWatching = async () => {
      try {
        // Request location permission
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          throw new Error('Location permission denied');
        }

        // Check if still mounted and active
        if (!mounted || !active) {
          return;
        }

        // Start watching location
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 10,
          },
          (location) => {
            // Process location update
            handleLocationUpdate(location);
          }
        );

        // Store subscription and update state
        if (mounted && active) {
          subscriptionRef.current = subscription;
          setIsRunning(true);
          setError(null);
        } else {
          // Unmounted or deactivated during async operation
          subscription.remove();
        }
      } catch (err) {
        // Handle permission or location service errors
        if (mounted) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          setIsRunning(false);
        }
      }
    };

    // Start the async operation
    startWatching();

    // Cleanup function
    return () => {
      mounted = false;

      // Close any open visit on deactivation
      if (currentStopIdRef.current && tEnterRef.current) {
        const stopId = currentStopIdRef.current;
        const tEnter = tEnterRef.current;
        const tLeave = new Date();

        recordStopVisit(stopId, tEnter, tLeave);

        currentStopIdRef.current = null;
        tEnterRef.current = null;
        proximityStateRef.current = { kind: 'outside' };
      }

      // Remove subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }

      setIsRunning(false);
    };
  }, [active, recordStopVisit]);

  /**
   * Handle GPS location update
   * Called by watchPositionAsync callback
   */
  const handleLocationUpdate = (location: Location.LocationObject) => {
    // Skip processing if no stops provided
    if (stops.length === 0) {
      return;
    }

    const { latitude, longitude } = location.coords;
    const position = { lat: latitude, lon: longitude };
    const timestamp = new Date(location.timestamp);

    // Find nearest stop
    const nearest = findNearestStop(position, stops);

    // No nearest stop found (should not happen if stops.length > 0, but be safe)
    if (!nearest) {
      return;
    }

    const { stopId, distanceMeters } = nearest;

    // Check if currently inside any stop
    const currentlyInside = currentStopIdRef.current !== null;

    // If inside a stop, check if we're still inside that specific stop
    if (currentlyInside) {
      const currentStopId = currentStopIdRef.current!;

      // Check distance to the current stop specifically (not just nearest)
      const currentStopCoords = stops.find(s => s.stopId === currentStopId)?.coords;

      if (currentStopCoords) {
        const distanceToCurrentStop = (() => {
          const lat1 = (currentStopCoords.lat * Math.PI) / 180;
          const lat2 = (position.lat * Math.PI) / 180;
          const deltaLat = ((position.lat - currentStopCoords.lat) * Math.PI) / 180;
          const deltaLon = ((position.lon - currentStopCoords.lon) * Math.PI) / 180;

          const sinDeltaLat = Math.sin(deltaLat / 2);
          const sinDeltaLon = Math.sin(deltaLon / 2);
          const a = sinDeltaLat * sinDeltaLat +
                    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLon * sinDeltaLon;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return 6371000 * c;
        })();

        // Still inside current stop?
        const stillInsideCurrentStop = distanceToCurrentStop < radiusMeters;

        // Check if we're now closer to a different stop
        const nearestIsDifferent = stopId !== currentStopId;
        const nearestIsInside = distanceMeters < radiusMeters;

        if (!stillInsideCurrentStop) {
          // Left the current stop - check if entering a different stop
          if (nearestIsInside && nearestIsDifferent) {
            // Transition: inside (stop A) → inside (stop B)
            const oldStopId = currentStopId;
            const oldTEnter = tEnterRef.current!;
            const tSwitch = timestamp;

            // Close old visit
            recordStopVisit(oldStopId, oldTEnter, tSwitch);

            // Open new visit
            currentStopIdRef.current = stopId;
            tEnterRef.current = tSwitch;
            setLastStopId(stopId);
          } else {
            // Transition: inside → outside
            const tEnter = tEnterRef.current!;
            const tLeave = timestamp;

            recordStopVisit(currentStopId, tEnter, tLeave);

            // Reset state
            currentStopIdRef.current = null;
            tEnterRef.current = null;
            setLastStopId(null);
          }
        } else if (stillInsideCurrentStop && nearestIsDifferent && nearestIsInside) {
          // Still inside current stop BUT nearest stop changed
          // This handles the case where we're inside overlapping stop radii
          // Switch to the new nearest stop
          const oldStopId = currentStopId;
          const oldTEnter = tEnterRef.current!;
          const tSwitch = timestamp;

          // Close old visit
          recordStopVisit(oldStopId, oldTEnter, tSwitch);

          // Open new visit
          currentStopIdRef.current = stopId;
          tEnterRef.current = tSwitch;
          setLastStopId(stopId);
        }
        // else: still inside same stop, no action needed
      }
    } else {
      // Currently outside - check if entering any stop
      // Check all stops in order and enter the first one we're inside
      // This handles overlapping stop radii by prioritizing array order
      let stopToEnter: string | null = null;

      for (const stop of stops) {
        const dist = (() => {
          const lat1 = (stop.coords.lat * Math.PI) / 180;
          const lat2 = (position.lat * Math.PI) / 180;
          const deltaLat = ((position.lat - stop.coords.lat) * Math.PI) / 180;
          const deltaLon = ((position.lon - stop.coords.lon) * Math.PI) / 180;

          const sinDeltaLat = Math.sin(deltaLat / 2);
          const sinDeltaLon = Math.sin(deltaLon / 2);
          const a = sinDeltaLat * sinDeltaLat +
                    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLon * sinDeltaLon;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return 6371000 * c;
        })();

        if (dist < radiusMeters) {
          stopToEnter = stop.stopId;
          break; // Enter first stop in array that we're inside
        }
      }

      if (stopToEnter) {
        // Transition: outside → inside
        currentStopIdRef.current = stopToEnter;
        tEnterRef.current = timestamp;
        setLastStopId(stopToEnter);
      }
    }
  };

  return {
    isRunning,
    lastStopId,
    error,
  };
}

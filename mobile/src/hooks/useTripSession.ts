/**
 * useTripSession Hook
 *
 * Manages the active trip session when user is on a trip.
 * Tracks route, direction, stops, and start time for later ride submission.
 *
 * This is in-memory state only (no persistence or API calls).
 * When the trip ends, the session data can be used to submit
 * ride segments to the BMTC Transit API backend for learning.
 *
 * Usage Flow:
 * 1. User selects a journey suggestion from Home screen
 * 2. App calls startTrip(journey) to create session
 * 3. App navigates to Trip screen (showing real-time progress)
 * 4. User ends trip -> app calls endTrip()
 * 5. (Optional) Use session data to submit ride to backend
 */

import { useState, useCallback } from 'react';
import type { Journey, TripSession } from '../types';

/**
 * Hook return type
 */
export interface UseTripSessionReturn {
  /**
   * Active trip session, or null if no trip in progress
   */
  session: TripSession | null;

  /**
   * Start a new trip session from a selected journey
   */
  startTrip: (journey: Journey) => void;

  /**
   * End the current trip session
   */
  endTrip: () => void;
}

/**
 * useTripSession - Manage active trip sessions
 *
 * @returns Trip session state and control functions
 *
 * @example
 * ```tsx
 * const { session, startTrip, endTrip } = useTripSession();
 *
 * // User selects journey
 * if (!session) {
 *   startTrip(selectedJourney);
 *   navigation.navigate('Trip');
 * }
 *
 * // During trip
 * if (session) {
 *   console.log('Route:', session.route_id);
 *   console.log('Started:', session.started_at);
 * }
 *
 * // User ends trip
 * endTrip();
 * ```
 */
export function useTripSession(): UseTripSessionReturn {
  const [session, setSession] = useState<TripSession | null>(null);

  /**
   * Start a new trip from a journey
   * Creates TripSession with route, direction, stops, and timestamp
   */
  const startTrip = useCallback((journey: Journey) => {
    const newSession: TripSession = {
      route_id: journey.route.route_id,
      direction_id: journey.directionId,
      from_stop_id: journey.fromStop.stop_id,
      to_stop_id: journey.toStop.stop_id || undefined,
      started_at: new Date().toISOString(),
      journeyId: journey.id,
    };

    setSession(newSession);
  }, []);

  /**
   * End the current trip
   * Clears the session back to null
   */
  const endTrip = useCallback(() => {
    setSession(null);
  }, []);

  return {
    session,
    startTrip,
    endTrip,
  };
}

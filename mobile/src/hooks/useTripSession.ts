/**
 * useTripSession Hook
 *
 * Manages the active trip session when user is on a trip.
 * Tracks route, direction, stops, and GPS events for later ride submission.
 *
 * New functionality (integrated with backend):
 * - Records stop events (enter/leave timestamps) during the trip
 * - Builds ride segments from stop events when trip ends
 * - Submits ride summary to backend API for learning
 * - Handles submission errors gracefully
 *
 * Usage Flow:
 * 1. User selects a journey suggestion from Home screen
 * 2. App calls startTrip(journey) to create session
 * 3. App navigates to Trip screen (showing real-time progress)
 * 4. During trip: app calls recordStopVisit(stopId, tEnter, tLeave) for each stop
 * 5. User ends trip -> app calls endTrip()
 * 6. endTrip() builds segments and submits to backend automatically
 * 7. Session is cleared after submission (success or failure)
 */

import { useState, useCallback } from 'react';
import type { Journey, TripSession } from '../types';
import type { PostRideSummaryRequest, PostRideSummaryResponse } from '../api/client';
import { buildSegmentsFromStopEvents } from '../domain/segments';
import { postRideSummary } from '../api/client';
import {
  getApiKey,
  getDeviceBucket,
  generateIdempotencyKey,
  DEFAULT_MAPMATCH_CONFIDENCE,
} from '../config/ride';

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
   * Record a stop visit during the trip
   *
   * @param stopId - GTFS stop_id
   * @param tEnter - Timestamp when entered stop's geofence
   * @param tLeave - Timestamp when left stop's geofence
   */
  recordStopVisit: (stopId: string, tEnter: Date, tLeave: Date) => void;

  /**
   * End the current trip session
   *
   * Builds segments from recorded stop events and submits to backend.
   * Returns a result object indicating submission outcome.
   *
   * Three possible outcomes:
   * 1. { submitted: true, error: undefined } - Successfully submitted to backend
   * 2. { submitted: false, error: Error } - Submission failed (network/API error)
   * 3. { submitted: false, error: undefined } - Not submitted (no data collected)
   *
   * @returns Promise resolving to submission result
   */
  endTrip: () => Promise<{ submitted: boolean; error?: Error }>;

  /**
   * Error from ride submission (if any)
   * Undefined if no error or no submission attempted yet
   */
  submissionError?: Error;

  /**
   * Debug: Last ride summary request sent to API
   * Undefined if no submission has occurred yet in this session
   */
  lastRequest?: PostRideSummaryRequest;

  /**
   * Debug: Last successful response from API
   * Undefined if no successful submission yet or last submission failed
   */
  lastResponse?: PostRideSummaryResponse;
}

/**
 * useTripSession - Manage active trip sessions with ride submission
 *
 * @returns Trip session state and control functions
 *
 * @example
 * ```tsx
 * const { session, startTrip, recordStopVisit, endTrip, submissionError } = useTripSession();
 *
 * // User selects journey
 * if (!session) {
 *   startTrip(selectedJourney);
 *   navigation.navigate('Trip');
 * }
 *
 * // During trip (GPS tracking detects stop visit)
 * if (session) {
 *   recordStopVisit('20558', enterTime, leaveTime);
 * }
 *
 * // User ends trip
 * await endTrip(); // Automatically submits to backend
 *
 * // Check for errors
 * if (submissionError) {
 *   console.error('Submission failed:', submissionError.message);
 * }
 * ```
 */
export function useTripSession(): UseTripSessionReturn {
  const [session, setSession] = useState<TripSession | null>(null);
  const [submissionError, setSubmissionError] = useState<Error | undefined>(undefined);

  // Debug state: store last request/response for developer inspection
  const [lastRequest, setLastRequest] = useState<PostRideSummaryRequest | undefined>(undefined);
  const [lastResponse, setLastResponse] = useState<PostRideSummaryResponse | undefined>(undefined);

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
      stopEvents: [], // Initialize empty stop events array
    };

    setSession(newSession);
    setSubmissionError(undefined); // Clear any previous errors

    // Clear debug state when starting new trip
    setLastRequest(undefined);
    setLastResponse(undefined);
  }, []);

  /**
   * Record a stop visit during the active trip
   */
  const recordStopVisit = useCallback((stopId: string, tEnter: Date, tLeave: Date) => {
    setSession(currentSession => {
      if (!currentSession) {
        console.warn('recordStopVisit called with no active session');
        return currentSession;
      }

      // Add stop event to the session
      return {
        ...currentSession,
        stopEvents: [
          ...currentSession.stopEvents,
          {
            stopId,
            tEnter,
            tLeave,
          },
        ],
      };
    });
  }, []);

  /**
   * End the current trip
   *
   * Submits ride data to backend if there are recorded stop events.
   * Returns a result object indicating submission outcome.
   *
   * Three possible outcomes:
   * 1. { submitted: true, error: undefined } - Successfully submitted to backend
   * 2. { submitted: false, error: Error } - Submission failed (network/API error)
   * 3. { submitted: false, error: undefined } - Not submitted (no data collected)
   *
   * @returns Promise resolving to submission result
   */
  const endTrip = useCallback(async (): Promise<{ submitted: boolean; error?: Error }> => {
    if (!session) {
      // Outcome 3: No active session, nothing to submit
      return { submitted: false, error: undefined };
    }

    // If no stop events, just clear the session without submitting
    if (!session.stopEvents || session.stopEvents.length === 0) {
      console.log('No ride data to submit (no stop events recorded)');
      setSession(null);
      // Outcome 3: No data collected
      return { submitted: false, error: undefined };
    }

    try {
      // Build segments from stop events (returns empty array if < 2 events)
      const segments = buildSegmentsFromStopEvents(
        session.stopEvents,
        DEFAULT_MAPMATCH_CONFIDENCE
      );

      // If no segments were generated (< 2 stop events or other issues)
      if (segments.length === 0) {
        console.log('No segments generated from stop events (need at least 2 stops)');
        setSession(null);
        // Outcome 3: Insufficient data collected
        return { submitted: false, error: undefined };
      }

      // Get device bucket and API key
      const deviceBucket = await getDeviceBucket();
      const apiKey = getApiKey();
      const idempotencyKey = generateIdempotencyKey();

      // Construct request
      const request: PostRideSummaryRequest = {
        route_id: session.route_id,
        direction_id: session.direction_id,
        device_bucket: deviceBucket,
        segments: segments,
      };

      // Store request for debug purposes (before submission)
      setLastRequest(request);

      // Submit ride summary to backend
      const response = await postRideSummary(
        request,
        apiKey,
        idempotencyKey
      );

      // Store response for debug purposes
      setLastResponse(response);

      // Log success
      console.log('Ride submitted successfully:', {
        accepted: response.accepted_segments,
        rejected: response.rejected_segments,
      });

      // Clear session after successful submission
      setSession(null);
      setSubmissionError(undefined);

      // Outcome 1: Successfully submitted
      return { submitted: true, error: undefined };
    } catch (error) {
      // Log error but still clear the session
      console.error('Failed to submit ride:', error);

      const submissionErr = error instanceof Error ? error : new Error(String(error));
      setSubmissionError(submissionErr);

      // Note: lastRequest is already set (we attempted to send it)
      // lastResponse is NOT set (request failed)

      // Still clear the session even on error (don't leave in limbo)
      setSession(null);

      // Outcome 2: Submission failed with error
      return { submitted: false, error: submissionErr };
    }
  }, [session]);

  return {
    session,
    startTrip,
    recordStopVisit,
    endTrip,
    submissionError,
    lastRequest,
    lastResponse,
  };
}

/**
 * Tests for useTripSession hook
 *
 * This hook manages the active trip session:
 * - Tracks when a trip is in progress
 * - Stores trip metadata (route, direction, stops, start time)
 * - Records stop events (enter/leave timestamps) during the trip
 * - Provides startTrip/endTrip functions
 * - Submits ride summary to backend when trip ends
 *
 * Expected behavior:
 * - Initial state has no active session
 * - startTrip(journey) creates a TripSession from Journey data
 * - TripSession includes route_id, direction_id, from/to stops, timestamp
 * - recordStopVisit() adds stop events with enter/leave timestamps
 * - endTrip() builds segments from stop events and submits to backend
 * - endTrip() clears the session after successful submission
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useTripSession } from '../useTripSession';
import type { Journey } from '@/src/types';
import * as segmentsModule from '@/src/domain/segments';
import * as apiClient from '@/src/api/client';

// Mock expo-crypto (uses __mocks__/expo-crypto.js)
jest.mock('expo-crypto');

// Mock the domain and API modules
jest.mock('@/src/domain/segments');
jest.mock('@/src/api/client');

const mockBuildSegmentsFromStopEvents = segmentsModule.buildSegmentsFromStopEvents as jest.MockedFunction<
  typeof segmentsModule.buildSegmentsFromStopEvents
>;

const mockPostRideSummary = apiClient.postRideSummary as jest.MockedFunction<
  typeof apiClient.postRideSummary
>;

// Mock Journey data
const mockJourney: Journey = {
  id: 'journey-1',
  route: {
    route_id: '335E',
    route_short_name: '335E',
    route_long_name: 'Kengeri to Whitefield',
    route_type: 3,
    agency_id: 'BMTC',
  },
  fromStop: {
    stop_id: '20558',
    stop_name: 'Majestic',
    stop_lat: 12.9716,
    stop_lon: 77.5946,
  },
  toStop: {
    stop_id: '29374',
    stop_name: 'Electronic City',
    stop_lat: 12.8456,
    stop_lon: 77.6603,
  },
  directionId: 0,
  confidence: 'high',
  walkingDistanceM: 250,
  predictedTravelSec: 1800,
};

describe('useTripSession', () => {
  describe('Initial state', () => {
    it('should have no active session initially', () => {
      const { result } = renderHook(() => useTripSession());

      expect(result.current.session).toBeNull();
    });

    it('should provide startTrip function', () => {
      const { result } = renderHook(() => useTripSession());

      expect(typeof result.current.startTrip).toBe('function');
    });

    it('should provide endTrip function', () => {
      const { result } = renderHook(() => useTripSession());

      expect(typeof result.current.endTrip).toBe('function');
    });
  });

  describe('startTrip(journey)', () => {
    it('should create a trip session from journey data', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session).not.toBeNull();
    });

    it('should set route_id from journey.route.route_id', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session?.route_id).toBe('335E');
    });

    it('should set direction_id from journey.directionId', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session?.direction_id).toBe(0);
    });

    it('should set from_stop_id from journey.fromStop.stop_id', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session?.from_stop_id).toBe('20558');
    });

    it('should set to_stop_id from journey.toStop.stop_id', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session?.to_stop_id).toBe('29374');
    });

    it('should set started_at to a valid ISO-8601 timestamp', () => {
      const { result } = renderHook(() => useTripSession());

      const beforeStart = Date.now();

      act(() => {
        result.current.startTrip(mockJourney);
      });

      const afterStart = Date.now();

      expect(result.current.session?.started_at).toBeDefined();

      // Verify it's a valid ISO string
      const timestamp = new Date(result.current.session!.started_at).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeStart);
      expect(timestamp).toBeLessThanOrEqual(afterStart);

      // Verify ISO format (should not throw)
      expect(() => new Date(result.current.session!.started_at)).not.toThrow();
    });

    it('should set journeyId from journey.id', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session?.journeyId).toBe('journey-1');
    });

    it('should handle journey without to_stop_id (optional)', () => {
      const journeyWithoutDestination: Journey = {
        ...mockJourney,
        toStop: {
          ...mockJourney.toStop,
          stop_id: '',
        },
      };

      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(journeyWithoutDestination);
      });

      // Should still create session
      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.from_stop_id).toBe('20558');
    });

    it('should replace existing session if called twice', () => {
      const { result } = renderHook(() => useTripSession());

      const firstJourney = mockJourney;
      const secondJourney: Journey = {
        ...mockJourney,
        id: 'journey-2',
        route: {
          ...mockJourney.route,
          route_id: '500D',
        },
      };

      // Start first trip
      act(() => {
        result.current.startTrip(firstJourney);
      });

      expect(result.current.session?.route_id).toBe('335E');
      expect(result.current.session?.journeyId).toBe('journey-1');

      // Start second trip (should replace)
      act(() => {
        result.current.startTrip(secondJourney);
      });

      expect(result.current.session?.route_id).toBe('500D');
      expect(result.current.session?.journeyId).toBe('journey-2');
    });
  });

  describe('endTrip()', () => {
    it('should clear the active session', () => {
      const { result } = renderHook(() => useTripSession());

      // Start a trip
      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session).not.toBeNull();

      // End the trip
      act(() => {
        result.current.endTrip();
      });

      expect(result.current.session).toBeNull();
    });

    it('should be safe to call when no trip is active', () => {
      const { result } = renderHook(() => useTripSession());

      expect(result.current.session).toBeNull();

      // Should not throw
      expect(() => {
        act(() => {
          result.current.endTrip();
        });
      }).not.toThrow();

      expect(result.current.session).toBeNull();
    });

    it('should allow starting a new trip after ending', () => {
      const { result } = renderHook(() => useTripSession());

      // Start and end first trip
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.endTrip();
      });

      expect(result.current.session).toBeNull();

      // Start second trip
      act(() => {
        result.current.startTrip(mockJourney);
      });

      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.route_id).toBe('335E');
    });
  });

  describe('Complete workflow', () => {
    it('should handle full trip lifecycle', () => {
      const { result } = renderHook(() => useTripSession());

      // No active trip initially
      expect(result.current.session).toBeNull();

      // User selects journey and starts trip
      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Trip is now active
      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.route_id).toBe('335E');
      expect(result.current.session?.direction_id).toBe(0);
      expect(result.current.session?.from_stop_id).toBe('20558');
      expect(result.current.session?.to_stop_id).toBe('29374');
      expect(result.current.session?.journeyId).toBe('journey-1');

      // Verify timestamp is recent
      const sessionStart = new Date(result.current.session!.started_at);
      const now = new Date();
      const diffMs = now.getTime() - sessionStart.getTime();
      expect(diffMs).toBeLessThan(1000); // Less than 1 second ago

      // User completes trip
      act(() => {
        result.current.endTrip();
      });

      // Session cleared
      expect(result.current.session).toBeNull();
    });
  });

  describe('Stop event tracking', () => {
    it('should provide recordStopVisit function', () => {
      const { result } = renderHook(() => useTripSession());

      expect(typeof result.current.recordStopVisit).toBe('function');
    });

    it('should record stop visits with enter/leave timestamps', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      const tEnter = new Date('2025-12-11T10:00:00Z');
      const tLeave = new Date('2025-12-11T10:01:30Z');

      act(() => {
        result.current.recordStopVisit('20558', tEnter, tLeave);
      });

      expect(result.current.session?.stopEvents).toHaveLength(1);
      expect(result.current.session?.stopEvents[0]).toEqual({
        stopId: '20558',
        tEnter: tEnter,
        tLeave: tLeave,
      });
    });

    it('should accumulate multiple stop visits in order', () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:00Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '21234',
          new Date('2025-12-11T10:05:00Z'),
          new Date('2025-12-11T10:06:00Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:10:00Z'),
          new Date('2025-12-11T10:12:00Z')
        );
      });

      expect(result.current.session?.stopEvents).toHaveLength(3);
      expect(result.current.session?.stopEvents[0].stopId).toBe('20558');
      expect(result.current.session?.stopEvents[1].stopId).toBe('21234');
      expect(result.current.session?.stopEvents[2].stopId).toBe('29374');
    });
  });

  describe('Ride submission on trip end', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Default mock implementations
      mockBuildSegmentsFromStopEvents.mockReturnValue([
        {
          from_stop_id: '20558',
          to_stop_id: '29374',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
      ]);

      mockPostRideSummary.mockResolvedValue({
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      });
    });

    it('should build segments from stop events when trip ends', async () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Record 2 stop visits
      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      await act(async () => {
        await result.current.endTrip();
      });

      // Verify buildSegmentsFromStopEvents was called with stop events
      expect(mockBuildSegmentsFromStopEvents).toHaveBeenCalledTimes(1);
      expect(mockBuildSegmentsFromStopEvents).toHaveBeenCalledWith(
        [
          {
            stopId: '20558',
            tEnter: new Date('2025-12-11T10:00:00Z'),
            tLeave: new Date('2025-12-11T10:01:30Z'),
          },
          {
            stopId: '29374',
            tEnter: new Date('2025-12-11T10:06:30Z'),
            tLeave: new Date('2025-12-11T10:08:00Z'),
          },
        ],
        0.9 // mapmatch confidence
      );
    });

    it('should submit ride summary with correct fields when trip ends', async () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Record stop visits
      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      await act(async () => {
        await result.current.endTrip();
      });

      // Verify postRideSummary was called exactly once
      expect(mockPostRideSummary).toHaveBeenCalledTimes(1);

      // Verify the request structure
      const [request, apiKey, idempotencyKey] = mockPostRideSummary.mock.calls[0];

      expect(request.route_id).toBe('335E');
      expect(request.direction_id).toBe(0);
      expect(request.device_bucket).toBeDefined();
      expect(request.device_bucket).not.toBe('');
      expect(request.segments).toEqual([
        {
          from_stop_id: '20558',
          to_stop_id: '29374',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
      ]);

      // Verify API key is provided
      expect(apiKey).toBeDefined();
      expect(apiKey).not.toBe('');

      // Verify idempotency key is a valid UUID
      expect(idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should clear session after successful ride submission', async () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      expect(result.current.session).not.toBeNull();

      await act(async () => {
        await result.current.endTrip();
      });

      // Wait for async operations to complete
      await waitFor(() => {
        expect(result.current.session).toBeNull();
      });
    });

    it('should not submit when no stop events recorded', async () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Don't record any stop visits

      await act(async () => {
        await result.current.endTrip();
      });

      // Should not call buildSegmentsFromStopEvents or postRideSummary
      expect(mockBuildSegmentsFromStopEvents).not.toHaveBeenCalled();
      expect(mockPostRideSummary).not.toHaveBeenCalled();

      // Session should still be cleared
      expect(result.current.session).toBeNull();
    });

    it('should not submit when only one stop event recorded', async () => {
      const { result } = renderHook(() => useTripSession());

      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Record only 1 stop visit (need at least 2 for a segment)
      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      // Mock buildSegmentsFromStopEvents to return empty array (< 2 events)
      mockBuildSegmentsFromStopEvents.mockReturnValue([]);

      await act(async () => {
        await result.current.endTrip();
      });

      // buildSegmentsFromStopEvents should be called but return []
      expect(mockBuildSegmentsFromStopEvents).toHaveBeenCalled();
      // postRideSummary should NOT be called (no segments)
      expect(mockPostRideSummary).not.toHaveBeenCalled();

      expect(result.current.session).toBeNull();
    });
  });

  describe('Three-Outcome Trip Submission Model', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockBuildSegmentsFromStopEvents.mockReturnValue([
        {
          from_stop_id: '20558',
          to_stop_id: '29374',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
      ]);

      mockPostRideSummary.mockResolvedValue({
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      });
    });

    describe('Outcome 1: Successful submission', () => {
      it('should return { submitted: true, error: undefined } when API submission succeeds', async () => {
        const { result } = renderHook(() => useTripSession());

        // Start trip and record stop visits
        act(() => {
          result.current.startTrip(mockJourney);
        });

        act(() => {
          result.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });

        act(() => {
          result.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:06:30Z'),
            new Date('2025-12-11T10:08:00Z')
          );
        });

        // End trip
        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        // Verify result structure
        expect(endTripResult).toBeDefined();
        expect(endTripResult).toEqual({
          submitted: true,
          error: undefined,
        });

        // Verify API was called
        expect(mockPostRideSummary).toHaveBeenCalledTimes(1);

        // Verify session is cleared
        await waitFor(() => {
          expect(result.current.session).toBeNull();
        });

        // Verify no error
        expect(result.current.submissionError).toBeUndefined();
      });

      it('should return submitted: true when multiple segments are submitted', async () => {
        // Mock multiple segments
        mockBuildSegmentsFromStopEvents.mockReturnValue([
          {
            from_stop_id: '20558',
            to_stop_id: '21234',
            duration_sec: 300,
            dwell_sec: 60,
            observed_at_utc: '2025-12-11T10:04:00.000Z',
            mapmatch_conf: 0.9,
          },
          {
            from_stop_id: '21234',
            to_stop_id: '29374',
            duration_sec: 240,
            dwell_sec: 45,
            observed_at_utc: '2025-12-11T10:09:00.000Z',
            mapmatch_conf: 0.85,
          },
        ]);

        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        act(() => {
          result.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:00Z')
          );
        });

        act(() => {
          result.current.recordStopVisit(
            '21234',
            new Date('2025-12-11T10:04:00Z'),
            new Date('2025-12-11T10:05:00Z')
          );
        });

        act(() => {
          result.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:09:00Z'),
            new Date('2025-12-11T10:10:00Z')
          );
        });

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        expect(endTripResult).toEqual({
          submitted: true,
          error: undefined,
        });

        expect(mockPostRideSummary).toHaveBeenCalledTimes(1);
      });
    });

    describe('Outcome 2: Submission failed (network/API error)', () => {
      it('should return { submitted: false, error: Error } when API submission fails', async () => {
        const networkError = new Error('Network error: Failed to fetch');
        mockPostRideSummary.mockRejectedValue(networkError);

        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        act(() => {
          result.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });

        act(() => {
          result.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:06:30Z'),
            new Date('2025-12-11T10:08:00Z')
          );
        });

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        // Verify result structure
        expect(endTripResult).toBeDefined();
        expect(endTripResult).toEqual({
          submitted: false,
          error: networkError,
        });

        // Verify API was called (but failed)
        expect(mockPostRideSummary).toHaveBeenCalledTimes(1);

        // Verify error is set in hook state
        await waitFor(() => {
          expect(result.current.submissionError).toBeDefined();
          expect(result.current.submissionError?.message).toBe('Network error: Failed to fetch');
        });

        // Session should still be cleared even on error
        expect(result.current.session).toBeNull();
      });

      it('should return submitted: false with error for different API error types', async () => {
        const apiError = new Error('API Error: 500 Internal Server Error');
        mockPostRideSummary.mockRejectedValue(apiError);

        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        act(() => {
          result.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });

        act(() => {
          result.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:06:30Z'),
            new Date('2025-12-11T10:08:00Z')
          );
        });

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        expect(endTripResult.submitted).toBe(false);
        expect(endTripResult.error).toBe(apiError);
        expect(endTripResult.error.message).toBe('API Error: 500 Internal Server Error');
      });

      it('should return submitted: false with error for timeout errors', async () => {
        const timeoutError = new Error('Request timeout after 30s');
        mockPostRideSummary.mockRejectedValue(timeoutError);

        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        act(() => {
          result.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });

        act(() => {
          result.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:06:30Z'),
            new Date('2025-12-11T10:08:00Z')
          );
        });

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        expect(endTripResult.submitted).toBe(false);
        expect(endTripResult.error.message).toBe('Request timeout after 30s');
      });
    });

    describe('Outcome 3: Not submitted (no data collected)', () => {
      it('should return { submitted: false, error: undefined } when no stop events recorded', async () => {
        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        // Don't record any stop visits

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        // Verify result structure
        expect(endTripResult).toBeDefined();
        expect(endTripResult).toEqual({
          submitted: false,
          error: undefined,
        });

        // Verify API was NOT called
        expect(mockPostRideSummary).not.toHaveBeenCalled();

        // Session should be cleared
        expect(result.current.session).toBeNull();

        // No error should be set
        expect(result.current.submissionError).toBeUndefined();
      });

      it('should return { submitted: false, error: undefined } when insufficient stops (< 2)', async () => {
        // Mock buildSegmentsFromStopEvents to return empty array (< 2 stops)
        mockBuildSegmentsFromStopEvents.mockReturnValue([]);

        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        // Record only 1 stop visit
        act(() => {
          result.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        // Verify result structure
        expect(endTripResult).toEqual({
          submitted: false,
          error: undefined,
        });

        // buildSegmentsFromStopEvents should be called but return []
        expect(mockBuildSegmentsFromStopEvents).toHaveBeenCalled();

        // API should NOT be called (no segments)
        expect(mockPostRideSummary).not.toHaveBeenCalled();

        // Session cleared, no error
        expect(result.current.session).toBeNull();
        expect(result.current.submissionError).toBeUndefined();
      });

      it('should return { submitted: false, error: undefined } when stopEvents array is empty', async () => {
        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        // Start trip but don't record any stops

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        expect(endTripResult).toEqual({
          submitted: false,
          error: undefined,
        });

        // buildSegmentsFromStopEvents should NOT be called
        expect(mockBuildSegmentsFromStopEvents).not.toHaveBeenCalled();
        expect(mockPostRideSummary).not.toHaveBeenCalled();
      });

      it('should handle case where trip is ended immediately after start', async () => {
        const { result } = renderHook(() => useTripSession());

        act(() => {
          result.current.startTrip(mockJourney);
        });

        // Immediately end trip without recording any stops
        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        expect(endTripResult).toEqual({
          submitted: false,
          error: undefined,
        });

        expect(mockPostRideSummary).not.toHaveBeenCalled();
        expect(result.current.session).toBeNull();
      });
    });

    describe('Edge cases for three-outcome model', () => {
      it('should return { submitted: false, error: undefined } when endTrip called with no active session', async () => {
        const { result } = renderHook(() => useTripSession());

        // Don't start a trip
        expect(result.current.session).toBeNull();

        let endTripResult: any;
        await act(async () => {
          endTripResult = await result.current.endTrip();
        });

        // Should return not-submitted outcome
        expect(endTripResult).toEqual({
          submitted: false,
          error: undefined,
        });

        expect(mockPostRideSummary).not.toHaveBeenCalled();
      });

      it('should maintain result structure consistency across all outcomes', async () => {
        const { result: result1 } = renderHook(() => useTripSession());
        const { result: result2 } = renderHook(() => useTripSession());
        const { result: result3 } = renderHook(() => useTripSession());

        // Outcome 1: Success
        act(() => {
          result1.current.startTrip(mockJourney);
        });
        act(() => {
          result1.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });
        act(() => {
          result1.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:06:30Z'),
            new Date('2025-12-11T10:08:00Z')
          );
        });
        let outcome1: any;
        await act(async () => {
          outcome1 = await result1.current.endTrip();
        });

        // Outcome 2: Error
        mockPostRideSummary.mockRejectedValue(new Error('API Error'));
        act(() => {
          result2.current.startTrip(mockJourney);
        });
        act(() => {
          result2.current.recordStopVisit(
            '20558',
            new Date('2025-12-11T10:00:00Z'),
            new Date('2025-12-11T10:01:30Z')
          );
        });
        act(() => {
          result2.current.recordStopVisit(
            '29374',
            new Date('2025-12-11T10:06:30Z'),
            new Date('2025-12-11T10:08:00Z')
          );
        });
        let outcome2: any;
        await act(async () => {
          outcome2 = await result2.current.endTrip();
        });

        // Outcome 3: No data
        act(() => {
          result3.current.startTrip(mockJourney);
        });
        let outcome3: any;
        await act(async () => {
          outcome3 = await result3.current.endTrip();
        });

        // All outcomes should have same structure
        expect(outcome1).toHaveProperty('submitted');
        expect(outcome1).toHaveProperty('error');
        expect(outcome2).toHaveProperty('submitted');
        expect(outcome2).toHaveProperty('error');
        expect(outcome3).toHaveProperty('submitted');
        expect(outcome3).toHaveProperty('error');

        // Verify values
        expect(outcome1.submitted).toBe(true);
        expect(outcome1.error).toBeUndefined();
        expect(outcome2.submitted).toBe(false);
        expect(outcome2.error).toBeDefined();
        expect(outcome3.submitted).toBe(false);
        expect(outcome3.error).toBeUndefined();
      });
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockBuildSegmentsFromStopEvents.mockReturnValue([
        {
          from_stop_id: '20558',
          to_stop_id: '29374',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
      ]);
    });

    it('should handle API errors gracefully', async () => {
      const { result } = renderHook(() => useTripSession());

      // Mock postRideSummary to reject
      const apiError = new Error('Network error');
      mockPostRideSummary.mockRejectedValue(apiError);

      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      // Should not throw (errors are caught internally)
      await act(async () => {
        await result.current.endTrip();
      });

      // Verify error state is set
      await waitFor(() => {
        expect(result.current.submissionError).toBeDefined();
        expect(result.current.submissionError?.message).toBe('Network error');
      });

      // Session should still be cleared even on error
      expect(result.current.session).toBeNull();
    });

    it('should expose submissionError state', () => {
      const { result } = renderHook(() => useTripSession());

      // Initially no error
      expect(result.current.submissionError).toBeUndefined();
    });

    it('should clear submissionError when starting a new trip', async () => {
      const { result } = renderHook(() => useTripSession());

      // Cause an error
      mockPostRideSummary.mockRejectedValue(new Error('API error'));

      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      await act(async () => {
        try {
          await result.current.endTrip();
        } catch (e) {
          // Ignore
        }
      });

      // Error should be set
      await waitFor(() => {
        expect(result.current.submissionError).toBeDefined();
      });

      // Start a new trip
      mockPostRideSummary.mockResolvedValue({
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      });

      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Error should be cleared
      expect(result.current.submissionError).toBeUndefined();
    });
  });

  describe('Debug state tracking', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Default mock implementations
      mockBuildSegmentsFromStopEvents.mockReturnValue([
        {
          from_stop_id: '20558',
          to_stop_id: '29374',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
      ]);

      mockPostRideSummary.mockResolvedValue({
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      });
    });

    it('should initialize with no debug data', () => {
      const { result } = renderHook(() => useTripSession());

      // Verify initial state has undefined debug data
      expect(result.current.lastRequest).toBeUndefined();
      expect(result.current.lastResponse).toBeUndefined();
    });

    it('should store request when endTrip submits to API', async () => {
      const { result } = renderHook(() => useTripSession());

      // Start trip and record stops
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      // End trip (triggers submission)
      await act(async () => {
        await result.current.endTrip();
      });

      // Wait for async operations
      await waitFor(() => {
        expect(result.current.lastRequest).toBeDefined();
      });

      // Verify lastRequest contains the submitted data
      expect(result.current.lastRequest).toMatchObject({
        route_id: '335E',
        direction_id: 0,
        device_bucket: expect.any(String),
        segments: [
          {
            from_stop_id: '20558',
            to_stop_id: '29374',
            duration_sec: 390,
            dwell_sec: 90,
            observed_at_utc: '2025-12-11T10:06:30.000Z',
            mapmatch_conf: 0.9,
          },
        ],
      });
    });

    it('should store response on successful submission', async () => {
      const { result } = renderHook(() => useTripSession());

      const mockResponse = {
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      };

      mockPostRideSummary.mockResolvedValue(mockResponse);

      // Start trip and record stops
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      // End trip
      await act(async () => {
        await result.current.endTrip();
      });

      // Wait for async operations
      await waitFor(() => {
        expect(result.current.lastResponse).toBeDefined();
      });

      // Verify lastResponse matches the API response
      expect(result.current.lastResponse).toEqual(mockResponse);
    });

    it('should store request even on API failure', async () => {
      const { result } = renderHook(() => useTripSession());

      // Mock API rejection
      const apiError = new Error('Network timeout');
      mockPostRideSummary.mockRejectedValue(apiError);

      // Start trip and record stops
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      // End trip (will fail)
      await act(async () => {
        await result.current.endTrip();
      });

      // Wait for error state
      await waitFor(() => {
        expect(result.current.submissionError).toBeDefined();
      });

      // Verify lastRequest is set even though submission failed
      expect(result.current.lastRequest).toBeDefined();
      expect(result.current.lastRequest?.route_id).toBe('335E');
      expect(result.current.lastRequest?.segments).toHaveLength(1);

      // Verify lastResponse is NOT set (API failed)
      expect(result.current.lastResponse).toBeUndefined();
    });

    it('should preserve debug data after session clears', async () => {
      const { result } = renderHook(() => useTripSession());

      // Start trip and record stops
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      // End trip
      await act(async () => {
        await result.current.endTrip();
      });

      // Wait for session to clear
      await waitFor(() => {
        expect(result.current.session).toBeNull();
      });

      // Verify debug data persists even though session is null
      expect(result.current.lastRequest).toBeDefined();
      expect(result.current.lastResponse).toBeDefined();

      // Verify the preserved data is correct
      expect(result.current.lastRequest?.route_id).toBe('335E');
      expect(result.current.lastResponse?.accepted_segments).toBe(1);
    });

    it('should clear debug data when starting new trip', async () => {
      const { result } = renderHook(() => useTripSession());

      // Complete first trip with debug data
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      await act(async () => {
        await result.current.endTrip();
      });

      // Wait for debug data to be set
      await waitFor(() => {
        expect(result.current.lastRequest).toBeDefined();
        expect(result.current.lastResponse).toBeDefined();
      });

      // Verify session is cleared but debug data persists
      expect(result.current.session).toBeNull();

      // Start a new trip
      act(() => {
        result.current.startTrip({
          ...mockJourney,
          id: 'journey-2',
          route: {
            ...mockJourney.route,
            route_id: '500D',
          },
        });
      });

      // Verify debug data is cleared when new trip starts
      expect(result.current.lastRequest).toBeUndefined();
      expect(result.current.lastResponse).toBeUndefined();

      // Verify new session is active
      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.route_id).toBe('500D');
      expect(result.current.session?.journeyId).toBe('journey-2');
    });

    it('should handle multiple successful submissions with debug data', async () => {
      const { result } = renderHook(() => useTripSession());

      // First trip
      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      await act(async () => {
        await result.current.endTrip();
      });

      await waitFor(() => {
        expect(result.current.lastRequest).toBeDefined();
      });

      // Verify first trip debug data
      const firstRequest = result.current.lastRequest;
      expect(firstRequest?.route_id).toBe('335E');

      // Start second trip (should clear previous debug data)
      act(() => {
        result.current.startTrip({
          ...mockJourney,
          id: 'journey-2',
          route: {
            ...mockJourney.route,
            route_id: '500D',
          },
        });
      });

      // Verify debug data cleared
      expect(result.current.lastRequest).toBeUndefined();
      expect(result.current.lastResponse).toBeUndefined();

      // Mock different response for second trip
      mockBuildSegmentsFromStopEvents.mockReturnValue([
        {
          from_stop_id: '20558',
          to_stop_id: '21234',
          duration_sec: 240,
          dwell_sec: 60,
          observed_at_utc: '2025-12-11T11:00:00.000Z',
          mapmatch_conf: 0.85,
        },
      ]);

      mockPostRideSummary.mockResolvedValue({
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      });

      // Record stops for second trip
      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T11:00:00Z'),
          new Date('2025-12-11T11:01:00Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '21234',
          new Date('2025-12-11T11:04:00Z'),
          new Date('2025-12-11T11:05:00Z')
        );
      });

      await act(async () => {
        await result.current.endTrip();
      });

      await waitFor(() => {
        expect(result.current.lastRequest).toBeDefined();
      });

      // Verify second trip debug data is different
      expect(result.current.lastRequest?.route_id).toBe('500D');
      expect(result.current.lastRequest?.segments[0].to_stop_id).toBe('21234');
      expect(result.current.lastResponse?.accepted_segments).toBe(1);
    });

    it('should not store debug data when no segments are submitted', async () => {
      const { result } = renderHook(() => useTripSession());

      // Start trip but don't record enough stops
      act(() => {
        result.current.startTrip(mockJourney);
      });

      // Record only one stop (need at least 2 for segments)
      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      // Mock empty segments (< 2 stops)
      mockBuildSegmentsFromStopEvents.mockReturnValue([]);

      await act(async () => {
        await result.current.endTrip();
      });

      // Verify API was not called
      expect(mockPostRideSummary).not.toHaveBeenCalled();

      // Verify no debug data stored
      expect(result.current.lastRequest).toBeUndefined();
      expect(result.current.lastResponse).toBeUndefined();

      // Session should still be cleared
      expect(result.current.session).toBeNull();
    });

    it('should store partial debug data on API error before network failure', async () => {
      const { result } = renderHook(() => useTripSession());

      // Mock API to fail during the request
      const networkError = new Error('Failed to fetch');
      mockPostRideSummary.mockRejectedValue(networkError);

      act(() => {
        result.current.startTrip(mockJourney);
      });

      act(() => {
        result.current.recordStopVisit(
          '20558',
          new Date('2025-12-11T10:00:00Z'),
          new Date('2025-12-11T10:01:30Z')
        );
      });

      act(() => {
        result.current.recordStopVisit(
          '29374',
          new Date('2025-12-11T10:06:30Z'),
          new Date('2025-12-11T10:08:00Z')
        );
      });

      await act(async () => {
        await result.current.endTrip();
      });

      await waitFor(() => {
        expect(result.current.submissionError).toBeDefined();
      });

      // Request should be stored (we tried to send it)
      expect(result.current.lastRequest).toBeDefined();
      expect(result.current.lastRequest?.route_id).toBe('335E');

      // Response should NOT be stored (network failure)
      expect(result.current.lastResponse).toBeUndefined();

      // Error should be set
      expect(result.current.submissionError?.message).toBe('Failed to fetch');
    });
  });
});

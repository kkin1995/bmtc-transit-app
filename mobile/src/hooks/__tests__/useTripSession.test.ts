/**
 * Tests for useTripSession hook
 *
 * This hook manages the active trip session:
 * - Tracks when a trip is in progress
 * - Stores trip metadata (route, direction, stops, start time)
 * - Provides startTrip/endTrip functions
 *
 * Expected behavior:
 * - Initial state has no active session
 * - startTrip(journey) creates a TripSession from Journey data
 * - TripSession includes route_id, direction_id, from/to stops, timestamp
 * - endTrip() clears the session
 */

import { renderHook, act } from '@testing-library/react-native';
import { useTripSession } from '../useTripSession';
import type { Journey } from '@/src/types';

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
});

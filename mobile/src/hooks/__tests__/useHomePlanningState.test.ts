/**
 * Tests for useHomePlanningState hook
 *
 * This hook manages the trip planning state machine:
 * - idle: default state, showing map
 * - choosingDestination: user is selecting a destination stop
 * - choosingJourney: user is reviewing journey suggestions
 *
 * Expected behavior:
 * - Initial state is idle with no destination or journey
 * - beginDestinationSelection() transitions to choosingDestination
 * - setDestination(stop) stores the stop without changing stage
 * - beginJourneySelection() transitions to choosingJourney
 * - setSelectedJourney(journey) stores the journey without changing stage
 * - cancelPlanning() resets to idle and clears all data
 * - reset() is a synonym for cancelPlanning (used when trip completes)
 */

import { renderHook, act } from '@testing-library/react-native';
import { useHomePlanningState } from '../useHomePlanningState';
import type { Stop } from '@/src/api/types';
import type { Journey } from '@/src/types';

// Mock data
const mockStop: Stop = {
  stop_id: '12345',
  stop_name: 'Majestic Bus Station',
  stop_lat: 12.9716,
  stop_lon: 77.5946,
};

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

describe('useHomePlanningState', () => {
  describe('Initial state', () => {
    it('should start in idle state', () => {
      const { result } = renderHook(() => useHomePlanningState());

      expect(result.current.planningStage).toBe('idle');
    });

    it('should have no destination stop initially', () => {
      const { result } = renderHook(() => useHomePlanningState());

      expect(result.current.destinationStop).toBeUndefined();
    });

    it('should have no selected journey initially', () => {
      const { result } = renderHook(() => useHomePlanningState());

      expect(result.current.selectedJourney).toBeUndefined();
    });

    it('should provide actions object', () => {
      const { result } = renderHook(() => useHomePlanningState());

      expect(result.current.actions).toBeDefined();
      expect(typeof result.current.actions.beginDestinationSelection).toBe('function');
      expect(typeof result.current.actions.beginJourneySelection).toBe('function');
      expect(typeof result.current.actions.setDestination).toBe('function');
      expect(typeof result.current.actions.setSelectedJourney).toBe('function');
      expect(typeof result.current.actions.cancelPlanning).toBe('function');
      expect(typeof result.current.actions.reset).toBe('function');
    });
  });

  describe('beginDestinationSelection()', () => {
    it('should transition to choosingDestination state', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginDestinationSelection();
      });

      expect(result.current.planningStage).toBe('choosingDestination');
    });

    it('should not affect destination or journey data', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginDestinationSelection();
      });

      expect(result.current.destinationStop).toBeUndefined();
      expect(result.current.selectedJourney).toBeUndefined();
    });
  });

  describe('setDestination(stop)', () => {
    it('should store the destination stop', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.setDestination(mockStop);
      });

      expect(result.current.destinationStop).toEqual(mockStop);
    });

    it('should NOT automatically change planningStage', () => {
      const { result } = renderHook(() => useHomePlanningState());

      const initialStage = result.current.planningStage;

      act(() => {
        result.current.actions.setDestination(mockStop);
      });

      expect(result.current.planningStage).toBe(initialStage);
    });

    it('should allow setting destination from idle state', () => {
      const { result } = renderHook(() => useHomePlanningState());

      expect(result.current.planningStage).toBe('idle');

      act(() => {
        result.current.actions.setDestination(mockStop);
      });

      expect(result.current.destinationStop).toEqual(mockStop);
    });

    it('should allow updating destination', () => {
      const { result } = renderHook(() => useHomePlanningState());

      const newStop: Stop = {
        ...mockStop,
        stop_id: '67890',
        stop_name: 'Updated Stop',
      };

      act(() => {
        result.current.actions.setDestination(mockStop);
      });

      expect(result.current.destinationStop).toEqual(mockStop);

      act(() => {
        result.current.actions.setDestination(newStop);
      });

      expect(result.current.destinationStop).toEqual(newStop);
    });
  });

  describe('beginJourneySelection()', () => {
    it('should transition to choosingJourney state', () => {
      const { result } = renderHook(() => useHomePlanningState());

      // Set a destination first
      act(() => {
        result.current.actions.setDestination(mockStop);
        result.current.actions.beginJourneySelection();
      });

      expect(result.current.planningStage).toBe('choosingJourney');
    });

    it('should work from choosingDestination state', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginDestinationSelection();
        result.current.actions.setDestination(mockStop);
        result.current.actions.beginJourneySelection();
      });

      expect(result.current.planningStage).toBe('choosingJourney');
    });

    it('should preserve destination data', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.setDestination(mockStop);
        result.current.actions.beginJourneySelection();
      });

      expect(result.current.destinationStop).toEqual(mockStop);
    });
  });

  describe('setSelectedJourney(journey)', () => {
    it('should store the selected journey', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.setSelectedJourney(mockJourney);
      });

      expect(result.current.selectedJourney).toEqual(mockJourney);
    });

    it('should NOT automatically change planningStage', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginJourneySelection();
      });

      const stageBefore = result.current.planningStage;

      act(() => {
        result.current.actions.setSelectedJourney(mockJourney);
      });

      expect(result.current.planningStage).toBe(stageBefore);
    });

    it('should allow updating selected journey', () => {
      const { result } = renderHook(() => useHomePlanningState());

      const newJourney: Journey = {
        ...mockJourney,
        id: 'journey-2',
        confidence: 'medium',
      };

      act(() => {
        result.current.actions.setSelectedJourney(mockJourney);
      });

      expect(result.current.selectedJourney).toEqual(mockJourney);

      act(() => {
        result.current.actions.setSelectedJourney(newJourney);
      });

      expect(result.current.selectedJourney).toEqual(newJourney);
    });
  });

  describe('cancelPlanning()', () => {
    it('should reset planningStage to idle', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginDestinationSelection();
        result.current.actions.cancelPlanning();
      });

      expect(result.current.planningStage).toBe('idle');
    });

    it('should clear destination stop', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.setDestination(mockStop);
        result.current.actions.cancelPlanning();
      });

      expect(result.current.destinationStop).toBeUndefined();
    });

    it('should clear selected journey', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.setSelectedJourney(mockJourney);
        result.current.actions.cancelPlanning();
      });

      expect(result.current.selectedJourney).toBeUndefined();
    });

    it('should work from choosingJourney state', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginDestinationSelection();
        result.current.actions.setDestination(mockStop);
        result.current.actions.beginJourneySelection();
        result.current.actions.setSelectedJourney(mockJourney);
        result.current.actions.cancelPlanning();
      });

      expect(result.current.planningStage).toBe('idle');
      expect(result.current.destinationStop).toBeUndefined();
      expect(result.current.selectedJourney).toBeUndefined();
    });
  });

  describe('reset()', () => {
    it('should reset to idle state like cancelPlanning', () => {
      const { result } = renderHook(() => useHomePlanningState());

      act(() => {
        result.current.actions.beginDestinationSelection();
        result.current.actions.setDestination(mockStop);
        result.current.actions.reset();
      });

      expect(result.current.planningStage).toBe('idle');
      expect(result.current.destinationStop).toBeUndefined();
      expect(result.current.selectedJourney).toBeUndefined();
    });

    it('should be usable after trip completion', () => {
      const { result } = renderHook(() => useHomePlanningState());

      // Simulate full planning flow
      act(() => {
        result.current.actions.beginDestinationSelection();
        result.current.actions.setDestination(mockStop);
        result.current.actions.beginJourneySelection();
        result.current.actions.setSelectedJourney(mockJourney);
      });

      // Trip started and completed - reset for next trip
      act(() => {
        result.current.actions.reset();
      });

      expect(result.current.planningStage).toBe('idle');
      expect(result.current.destinationStop).toBeUndefined();
      expect(result.current.selectedJourney).toBeUndefined();
    });
  });

  describe('Complete workflow', () => {
    it('should handle full planning flow', () => {
      const { result } = renderHook(() => useHomePlanningState());

      // Start idle
      expect(result.current.planningStage).toBe('idle');

      // Begin destination selection
      act(() => {
        result.current.actions.beginDestinationSelection();
      });
      expect(result.current.planningStage).toBe('choosingDestination');

      // Set destination
      act(() => {
        result.current.actions.setDestination(mockStop);
      });
      expect(result.current.destinationStop).toEqual(mockStop);

      // Begin journey selection
      act(() => {
        result.current.actions.beginJourneySelection();
      });
      expect(result.current.planningStage).toBe('choosingJourney');

      // Select journey
      act(() => {
        result.current.actions.setSelectedJourney(mockJourney);
      });
      expect(result.current.selectedJourney).toEqual(mockJourney);

      // At this point, app would start trip and then reset after
      act(() => {
        result.current.actions.reset();
      });
      expect(result.current.planningStage).toBe('idle');
      expect(result.current.destinationStop).toBeUndefined();
      expect(result.current.selectedJourney).toBeUndefined();
    });
  });
});

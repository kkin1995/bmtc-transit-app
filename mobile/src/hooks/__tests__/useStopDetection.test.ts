/**
 * Tests for useStopDetection hook (TDD RED phase)
 *
 * This hook manages GPS-based stop detection during an active trip:
 * - Watches GPS location stream when active = true
 * - Detects when device enters/leaves stop proximity radius
 * - Calls recordStopVisit(stopId, tEnter, tLeave) for each complete visit
 * - Handles deactivation while inside a stop
 * - Manages permission errors and location service failures
 *
 * Test Strategy:
 * - Mock expo-location completely (no real GPS calls)
 * - Use triggerLocation() helper to simulate GPS updates
 * - Test state machine: outside → inside → outside transitions
 * - Verify recordStopVisit timing and parameters
 * - Test edge cases: boundary, no stops, errors
 *
 * Expected behavior:
 * - Initial state: isRunning = false, lastStopId = null, error = null
 * - On activation: starts watching location
 * - On entering stop (distance < radius): records entry time
 * - On leaving stop (distance >= radius): calls recordStopVisit with entry/exit times
 * - On deactivation while inside: immediately closes visit
 * - On error: sets error state, stops running
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useStopDetection } from '../useStopDetection';
import type { StopWithCoords } from '@/src/domain/geo';

// Mock expo-location module
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: {
    High: 4,
    Balanced: 3,
    Low: 2,
  },
}));

// Test data - Bangalore landmarks with precise coordinates
const STOP_MAJESTIC: StopWithCoords = {
  stopId: '20558',
  coords: { lat: 12.9716, lon: 77.5946 }, // Majestic Bus Stand
};

const STOP_MG_ROAD: StopWithCoords = {
  stopId: '29374',
  coords: { lat: 12.9756, lon: 77.6064 }, // MG Road
};

const STOP_WHITEFIELD: StopWithCoords = {
  stopId: '30123',
  coords: { lat: 12.9698, lon: 77.7500 }, // Whitefield
};

// Location helpers - computed using Haversine distance
// For 50m radius tests around STOP_MAJESTIC (12.9716, 77.5946)
const FAR_FROM_MAJESTIC = { lat: 12.9726, lon: 77.5946 }; // ~111m north (outside)
const NEAR_MAJESTIC = { lat: 12.9719, lon: 77.5946 }; // ~33m north (inside)
const BOUNDARY_MAJESTIC = { lat: 12.97205, lon: 77.5946 }; // ~50m north (boundary)

// Locations for multi-stop tests
const FAR_FROM_MG_ROAD = { lat: 12.9766, lon: 77.6064 }; // ~111m north of MG Road
const NEAR_MG_ROAD = { lat: 12.9759, lon: 77.6064 }; // ~33m north of MG Road

// Location between Majestic and MG Road (far from both)
const BETWEEN_STOPS = { lat: 12.9736, lon: 77.6005 };

describe('useStopDetection', () => {
  // Mock subscription and callback
  let mockLocationCallback: ((location: Location.LocationObject) => void) | null = null;
  let mockSubscription: { remove: jest.Mock };
  let mockTimestamp: number;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockLocationCallback = null;
    mockTimestamp = Date.now();

    // Create mock subscription
    mockSubscription = { remove: jest.fn() };

    // Mock permission grant
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });

    // Mock watchPositionAsync to capture callback
    (Location.watchPositionAsync as jest.Mock).mockImplementation(
      async (options, callback) => {
        mockLocationCallback = callback;
        return mockSubscription;
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockLocationCallback = null;
  });

  // Helper to trigger location update
  const triggerLocation = (lat: number, lon: number, deltaMs: number = 1000) => {
    if (!mockLocationCallback) {
      throw new Error('Location callback not set. Did hook activate?');
    }

    mockTimestamp += deltaMs;

    act(() => {
      mockLocationCallback!({
        coords: {
          latitude: lat,
          longitude: lon,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: mockTimestamp,
      });
    });
  };

  describe('Initial state', () => {
    it('should start with inactive state when active = false', () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: false,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      expect(result.current.isRunning).toBe(false);
      expect(result.current.lastStopId).toBe(null);
      expect(result.current.error).toBe(null);
    });

    it('should not call recordStopVisit initially', () => {
      const mockRecordStopVisit = jest.fn();

      renderHook(() =>
        useStopDetection({
          active: false,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      expect(mockRecordStopVisit).not.toHaveBeenCalled();
    });

    it('should not request location permissions when inactive', () => {
      const mockRecordStopVisit = jest.fn();

      renderHook(() =>
        useStopDetection({
          active: false,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  describe('Activation and deactivation', () => {
    it('should start watching location when active = true', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });
    });

    it('should request foreground location permissions', async () => {
      const mockRecordStopVisit = jest.fn();

      renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      });
    });

    it('should use high accuracy and fast update interval', async () => {
      const mockRecordStopVisit = jest.fn();

      renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            accuracy: Location.Accuracy.High,
            distanceInterval: expect.any(Number),
          }),
          expect.any(Function)
        );
      });
    });

    it('should stop watching location when deactivated', async () => {
      const mockRecordStopVisit = jest.fn();

      const { rerender } = renderHook(
        ({ active }) =>
          useStopDetection({
            active,
            routeId: '335E',
            directionId: 0,
            stops: [STOP_MAJESTIC],
            recordStopVisit: mockRecordStopVisit,
          }),
        { initialProps: { active: true } }
      );

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalled();
      });

      // Deactivate
      rerender({ active: false });

      await waitFor(() => {
        expect(mockSubscription.remove).toHaveBeenCalled();
      });
    });

    it('should cleanup subscription on unmount', async () => {
      const mockRecordStopVisit = jest.fn();

      const { unmount } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalled();
      });

      unmount();

      expect(mockSubscription.remove).toHaveBeenCalled();
    });
  });

  describe('Basic single-stop visit', () => {
    it('should detect entry into stop radius', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Start far from stop
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon);

      expect(result.current.lastStopId).toBe(null);

      // Enter stop radius
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });
    });

    it('should call recordStopVisit when leaving stop', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Start far from stop
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);

      // Enter stop
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Leave stop
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 2000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });
    });

    it('should call recordStopVisit with correct stopId', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → inside → far
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 2000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledWith(
          '20558',
          expect.any(Date),
          expect.any(Date)
        );
      });
    });

    it('should ensure tEnter < tLeave', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → inside (wait 5 sec) → far
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 5000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalled();
      });

      const [stopId, tEnter, tLeave] = mockRecordStopVisit.mock.calls[0];

      expect(tEnter).toBeInstanceOf(Date);
      expect(tLeave).toBeInstanceOf(Date);
      expect(tEnter.getTime()).toBeLessThan(tLeave.getTime());
    });

    it('should reset lastStopId after leaving stop', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → inside → far
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 2000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe(null);
      });
    });
  });

  describe('Multiple consecutive stops', () => {
    it('should detect visits to multiple stops in sequence', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC, STOP_MG_ROAD],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Visit Stop A
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 2000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });

      // Move to between stops
      triggerLocation(BETWEEN_STOPS.lat, BETWEEN_STOPS.lon, 3000);

      // Visit Stop B
      triggerLocation(NEAR_MG_ROAD.lat, NEAR_MG_ROAD.lon, 4000);
      triggerLocation(FAR_FROM_MG_ROAD.lat, FAR_FROM_MG_ROAD.lon, 5000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(2);
      });
    });

    it('should call recordStopVisit with correct stopIds for each visit', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC, STOP_MG_ROAD],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Visit Majestic
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);
      triggerLocation(BETWEEN_STOPS.lat, BETWEEN_STOPS.lon, 2000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });

      // Visit MG Road
      triggerLocation(NEAR_MG_ROAD.lat, NEAR_MG_ROAD.lon, 3000);
      triggerLocation(FAR_FROM_MG_ROAD.lat, FAR_FROM_MG_ROAD.lon, 4000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(2);
      });

      // Verify stop IDs
      expect(mockRecordStopVisit.mock.calls[0][0]).toBe('20558'); // Majestic
      expect(mockRecordStopVisit.mock.calls[1][0]).toBe('29374'); // MG Road
    });

    it('should update lastStopId for each stop visit', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC, STOP_MG_ROAD],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Enter Majestic
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Leave Majestic
      triggerLocation(BETWEEN_STOPS.lat, BETWEEN_STOPS.lon, 2000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe(null);
      });

      // Enter MG Road
      triggerLocation(NEAR_MG_ROAD.lat, NEAR_MG_ROAD.lon, 3000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('29374');
      });

      // Leave MG Road
      triggerLocation(FAR_FROM_MG_ROAD.lat, FAR_FROM_MG_ROAD.lon, 4000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe(null);
      });
    });
  });

  describe('Deactivation while inside stop', () => {
    it('should immediately close visit when deactivated inside stop', async () => {
      const mockRecordStopVisit = jest.fn();

      const { rerender, result } = renderHook(
        ({ active }) =>
          useStopDetection({
            active,
            routeId: '335E',
            directionId: 0,
            stops: [STOP_MAJESTIC],
            recordStopVisit: mockRecordStopVisit,
            radiusMeters: 50,
          }),
        { initialProps: { active: true } }
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Enter stop
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      expect(mockRecordStopVisit).not.toHaveBeenCalled();

      // Deactivate while inside
      rerender({ active: false });

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });
    });

    it('should set isRunning = false after deactivation', async () => {
      const mockRecordStopVisit = jest.fn();

      const { rerender, result } = renderHook(
        ({ active }) =>
          useStopDetection({
            active,
            routeId: '335E',
            directionId: 0,
            stops: [STOP_MAJESTIC],
            recordStopVisit: mockRecordStopVisit,
            radiusMeters: 50,
          }),
        { initialProps: { active: true } }
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Enter stop
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      // Deactivate
      rerender({ active: false });

      await waitFor(() => {
        expect(result.current.isRunning).toBe(false);
      });
    });

    it('should use deactivation time as tLeave', async () => {
      const mockRecordStopVisit = jest.fn();

      const { rerender, result } = renderHook(
        ({ active }) =>
          useStopDetection({
            active,
            routeId: '335E',
            directionId: 0,
            stops: [STOP_MAJESTIC],
            recordStopVisit: mockRecordStopVisit,
            radiusMeters: 50,
          }),
        { initialProps: { active: true } }
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      const tBeforeEnter = Date.now();

      // Enter stop
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const tBeforeDeactivate = Date.now();

      // Deactivate
      rerender({ active: false });

      const tAfterDeactivate = Date.now();

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalled();
      });

      const [, tEnter, tLeave] = mockRecordStopVisit.mock.calls[0];

      expect(tEnter.getTime()).toBeGreaterThanOrEqual(tBeforeEnter);
      expect(tLeave.getTime()).toBeGreaterThanOrEqual(tBeforeDeactivate);
      expect(tLeave.getTime()).toBeLessThanOrEqual(tAfterDeactivate);
    });
  });

  describe('Empty stops array', () => {
    it('should not throw when stops array is empty', async () => {
      const mockRecordStopVisit = jest.fn();

      expect(() => {
        renderHook(() =>
          useStopDetection({
            active: true,
            routeId: '335E',
            directionId: 0,
            stops: [],
            recordStopVisit: mockRecordStopVisit,
            radiusMeters: 50,
          })
        );
      }).not.toThrow();
    });

    it('should still start watching location with empty stops', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      expect(Location.watchPositionAsync).toHaveBeenCalled();
    });

    it('should never call recordStopVisit with empty stops', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Trigger some location updates
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MG_ROAD.lat, NEAR_MG_ROAD.lon, 1000);
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 2000);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockRecordStopVisit).not.toHaveBeenCalled();
    });

    it('should keep lastStopId as null with empty stops', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Trigger location updates
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 0);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.lastStopId).toBe(null);
    });
  });

  describe('Boundary conditions (exactly at radius)', () => {
    it('should treat distance === radius as outside', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Start far
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);

      // Move to exactly 50m (boundary)
      triggerLocation(BOUNDARY_MAJESTIC.lat, BOUNDARY_MAJESTIC.lon, 1000);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT enter stop (boundary is outside)
      expect(result.current.lastStopId).toBe(null);
    });

    it('should detect exit when crossing from inside to exactly radius', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → inside (30m)
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Move to boundary (50m)
      triggerLocation(BOUNDARY_MAJESTIC.lat, BOUNDARY_MAJESTIC.lon, 2000);

      // Should trigger exit
      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });

      expect(result.current.lastStopId).toBe(null);
    });

    it('should detect exit when crossing from inside to 51m', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → inside
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Move to 51m (just outside)
      const JUST_OUTSIDE = { lat: 12.972059, lon: 77.5946 }; // ~51m
      triggerLocation(JUST_OUTSIDE.lat, JUST_OUTSIDE.lon, 2000);

      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });

      expect(result.current.lastStopId).toBe(null);
    });
  });

  describe('Stop switching without leaving', () => {
    it('should close previous visit and open new visit when switching stops', async () => {
      const mockRecordStopVisit = jest.fn();

      // Position stops very close to each other (unrealistic but tests logic)
      const CLOSE_STOP_A: StopWithCoords = {
        stopId: 'STOP_A',
        coords: { lat: 12.9716, lon: 77.5946 },
      };

      const CLOSE_STOP_B: StopWithCoords = {
        stopId: 'STOP_B',
        coords: { lat: 12.9717, lon: 77.5946 }, // ~11m north
      };

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [CLOSE_STOP_A, CLOSE_STOP_B],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Start far from both
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);

      // Move to position that's inside STOP_A (30m from A)
      const NEAR_A = { lat: 12.97187, lon: 77.5946 }; // ~30m from A, ~42m from B
      triggerLocation(NEAR_A.lat, NEAR_A.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('STOP_A');
      });

      // Move to position closer to STOP_B (now inside B, outside A)
      const NEAR_B = { lat: 12.97177, lon: 77.5946 }; // ~19m from B, ~52m from A
      triggerLocation(NEAR_B.lat, NEAR_B.lon, 2000);

      // Should close visit to A and open visit to B
      await waitFor(() => {
        expect(mockRecordStopVisit).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('STOP_B');
      });

      expect(mockRecordStopVisit.mock.calls[0][0]).toBe('STOP_A');
    });

    it('should handle rapid stop switching', async () => {
      const mockRecordStopVisit = jest.fn();

      const CLOSE_STOP_A: StopWithCoords = {
        stopId: 'STOP_A',
        coords: { lat: 12.9716, lon: 77.5946 },
      };

      const CLOSE_STOP_B: StopWithCoords = {
        stopId: 'STOP_B',
        coords: { lat: 12.9718, lon: 77.5946 }, // ~22m north
      };

      const CLOSE_STOP_C: StopWithCoords = {
        stopId: 'STOP_C',
        coords: { lat: 12.9720, lon: 77.5946 }, // ~44m north
      };

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [CLOSE_STOP_A, CLOSE_STOP_B, CLOSE_STOP_C],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → A → B → C
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(12.97167, 77.5946, 1000); // Near A
      triggerLocation(12.97185, 77.5946, 2000); // Near B
      triggerLocation(12.97203, 77.5946, 3000); // Near C

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should record visits to A and B (C is still active)
      expect(mockRecordStopVisit.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Permission and location errors', () => {
    it('should set error when permission is denied', async () => {
      const mockRecordStopVisit = jest.fn();

      // Mock permission denial
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBe(null);
      });

      expect(result.current.error?.message).toMatch(/permission/i);
    });

    it('should set isRunning = false when permission denied', async () => {
      const mockRecordStopVisit = jest.fn();

      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBe(null);
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('should not call recordStopVisit when permission denied', async () => {
      const mockRecordStopVisit = jest.fn();

      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockRecordStopVisit).not.toHaveBeenCalled();
    });

    it('should handle watchPositionAsync errors gracefully', async () => {
      const mockRecordStopVisit = jest.fn();

      // Mock watchPositionAsync to reject
      (Location.watchPositionAsync as jest.Mock).mockRejectedValue(
        new Error('Location service unavailable')
      );

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBe(null);
      });

      expect(result.current.error?.message).toContain('Location service');
      expect(result.current.isRunning).toBe(false);
    });

    it('should handle permission request errors', async () => {
      const mockRecordStopVisit = jest.fn();

      (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(
        new Error('Permission request failed')
      );

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBe(null);
      });

      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('Custom radius parameter', () => {
    it('should use default radius of 50m when not specified', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          // radiusMeters not specified
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // 30m should be inside default 50m radius
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });
    });

    it('should respect custom radius of 100m', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 100,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // 80m should be inside 100m radius (but outside default 50m)
      const MEDIUM_DISTANCE = { lat: 12.97232, lon: 77.5946 }; // ~80m
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(MEDIUM_DISTANCE.lat, MEDIUM_DISTANCE.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });
    });

    it('should respect custom radius of 25m', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 25,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // 30m should be OUTSIDE 25m radius
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.lastStopId).toBe(null);
    });
  });

  describe('Dwell time inside stop', () => {
    it('should not call recordStopVisit while dwelling inside stop', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Far → inside
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Dwell inside (multiple updates)
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 2000);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 3000);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 4000);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have called recordStopVisit yet
      expect(mockRecordStopVisit).not.toHaveBeenCalled();
    });

    it('should maintain lastStopId while dwelling', async () => {
      const mockRecordStopVisit = jest.fn();

      const { result } = renderHook(() =>
        useStopDetection({
          active: true,
          routeId: '335E',
          directionId: 0,
          stops: [STOP_MAJESTIC],
          recordStopVisit: mockRecordStopVisit,
          radiusMeters: 50,
        })
      );

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Enter
      triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon, 0);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 1000);

      await waitFor(() => {
        expect(result.current.lastStopId).toBe('20558');
      });

      // Dwell
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 2000);
      triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon, 3000);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.lastStopId).toBe('20558');
    });
  });
});

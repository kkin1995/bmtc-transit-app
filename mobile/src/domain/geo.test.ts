/**
 * Tests for geospatial utilities
 *
 * Tests haversine distance calculations, nearest stop finding, and proximity state tracking.
 * These functions are used for stop detection and ride tracking in the mobile app.
 *
 * TDD Phase: RED (failing tests, implementation does not exist yet)
 *
 * Expected behavior:
 * - haversineDistanceMeters(): Calculate great-circle distance between two lat/lon points
 * - findNearestStop(): Find closest stop from an array of stops with coordinates
 * - updateStopProximityState(): Track when device enters/exits stop proximity radius
 */

import {
  haversineDistanceMeters,
  findNearestStop,
  updateStopProximityState,
  LatLon,
  StopWithCoords,
  ProximityState,
} from './geo';

// Test data: Bangalore landmarks
const MG_ROAD_METRO: LatLon = { lat: 12.9756, lon: 77.6064 };
const KEMPEGOWDA_STATION: LatLon = { lat: 12.9779, lon: 77.5717 };
// Expected distance: ~3.4 km (3400m)

const DISTANCE_TOLERANCE_METERS = 50; // For km-scale distances
const DISTANCE_TOLERANCE_SHORT_METERS = 1; // For < 1km distances

describe('haversineDistanceMeters', () => {
  describe('basic functionality', () => {
    it('should return zero distance for identical points', () => {
      // Arrange: Same point
      const point = { lat: 12.9716, lon: 77.5946 }; // Bangalore center

      // Act
      const distance = haversineDistanceMeters(point, point);

      // Assert: Distance should be exactly 0
      expect(distance).toBe(0);
    });

    it('should calculate ~111km for 1 degree latitude difference at equator', () => {
      // Arrange: Two points 1 degree apart in latitude (longitude same)
      // At equator, 1 degree latitude ≈ 111,195 meters (haversine on sphere R=6371km)
      const point1 = { lat: 0.0, lon: 77.0 };
      const point2 = { lat: 1.0, lon: 77.0 };

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should be approximately 111,195 meters (tolerance ±100m)
      expect(distance).toBeGreaterThan(111095);
      expect(distance).toBeLessThan(111295);
    });

    it('should be symmetric: distance(a, b) === distance(b, a)', () => {
      // Arrange: Two different points
      const pointA = { lat: 12.9716, lon: 77.5946 };
      const pointB = { lat: 12.9822, lon: 77.6089 };

      // Act
      const distanceAB = haversineDistanceMeters(pointA, pointB);
      const distanceBA = haversineDistanceMeters(pointB, pointA);

      // Assert: Distances should be identical (commutative property)
      expect(distanceAB).toBe(distanceBA);
    });

    it('should calculate realistic Bangalore landmark distances', () => {
      // Arrange: MG Road Metro to Kempegowda Station
      // Expected: ~3.77 km (haversine distance for given coordinates)

      // Act
      const distance = haversineDistanceMeters(MG_ROAD_METRO, KEMPEGOWDA_STATION);

      // Assert: Should be approximately 3769 meters
      expect(distance).toBeGreaterThan(3769 - DISTANCE_TOLERANCE_METERS);
      expect(distance).toBeLessThan(3769 + DISTANCE_TOLERANCE_METERS);
    });
  });

  describe('short distances (<1km)', () => {
    it('should accurately calculate 100m distance', () => {
      // Arrange: Two points ~100m apart
      // At Bangalore latitude (~13°N), 0.001° lat ≈ 111m
      const point1 = { lat: 12.9716, lon: 77.5946 };
      const point2 = { lat: 12.9725, lon: 77.5946 }; // ~0.0009° lat ≈ 100m

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should be approximately 100 meters
      expect(distance).toBeGreaterThan(99);
      expect(distance).toBeLessThan(101);
    });

    it('should calculate 50m proximity radius accurately', () => {
      // Arrange: Two points exactly 50m apart (typical stop radius)
      const point1 = { lat: 12.9716, lon: 77.5946 };
      // 50m ≈ 0.00045° at Bangalore latitude
      const point2 = { lat: 12.97205, lon: 77.5946 };

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should be approximately 50 meters
      expect(distance).toBeGreaterThan(49);
      expect(distance).toBeLessThan(51);
    });

    it('should handle sub-meter distances', () => {
      // Arrange: Points very close together (0.5 meters)
      const point1 = { lat: 12.9716, lon: 77.5946 };
      const point2 = { lat: 12.971604, lon: 77.5946 }; // ~0.5m north

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should be less than 1 meter
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1);
    });
  });

  describe('edge cases', () => {
    it('should handle North Pole coordinates', () => {
      // Arrange: North Pole and nearby point
      const northPole = { lat: 90.0, lon: 0.0 };
      const nearNorthPole = { lat: 89.9, lon: 0.0 }; // 0.1° from pole

      // Act
      const distance = haversineDistanceMeters(northPole, nearNorthPole);

      // Assert: Should calculate distance without error
      // 0.1° at pole ≈ 11.1 km
      expect(distance).toBeGreaterThan(11000);
      expect(distance).toBeLessThan(11200);
    });

    it('should handle South Pole coordinates', () => {
      // Arrange: South Pole and nearby point
      const southPole = { lat: -90.0, lon: 0.0 };
      const nearSouthPole = { lat: -89.9, lon: 0.0 };

      // Act
      const distance = haversineDistanceMeters(southPole, nearSouthPole);

      // Assert: Should calculate distance without error
      expect(distance).toBeGreaterThan(11000);
      expect(distance).toBeLessThan(11200);
    });

    it('should handle International Date Line crossing', () => {
      // Arrange: Points on either side of date line (180°/-180° longitude)
      const point1 = { lat: 0.0, lon: 179.9 };
      const point2 = { lat: 0.0, lon: -179.9 }; // 0.2° apart across date line

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should take shortest path (across date line)
      // 0.2° longitude at equator ≈ 22.2 km
      expect(distance).toBeGreaterThan(22000);
      expect(distance).toBeLessThan(22400);
    });

    it('should handle Prime Meridian (0° longitude)', () => {
      // Arrange: Points at Prime Meridian
      const point1 = { lat: 51.4778, lon: 0.0 }; // Greenwich
      const point2 = { lat: 51.5074, lon: 0.0 }; // Near London

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should calculate distance normally
      expect(distance).toBeGreaterThan(0);
    });

    it('should handle Equator crossing (0° latitude)', () => {
      // Arrange: Points crossing equator
      const point1 = { lat: -0.1, lon: 77.0 };
      const point2 = { lat: 0.1, lon: 77.0 };

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: 0.2° lat ≈ 22.2 km
      expect(distance).toBeGreaterThan(22000);
      expect(distance).toBeLessThan(22400);
    });
  });

  describe('precision and accuracy', () => {
    it('should handle coordinates with high decimal precision', () => {
      // Arrange: Points with 6 decimal places (sub-meter precision)
      const point1 = { lat: 12.971234, lon: 77.594567 };
      const point2 = { lat: 12.971235, lon: 77.594568 };

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should calculate small distance accurately
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.2); // Very small distance
    });

    it('should return number type (not NaN or Infinity)', () => {
      // Arrange: Normal points
      const point1 = { lat: 12.9716, lon: 77.5946 };
      const point2 = { lat: 12.9822, lon: 77.6089 };

      // Act
      const distance = haversineDistanceMeters(point1, point2);

      // Assert: Should be a valid number
      expect(typeof distance).toBe('number');
      expect(Number.isFinite(distance)).toBe(true);
      expect(Number.isNaN(distance)).toBe(false);
    });

    it('should always return non-negative distance', () => {
      // Arrange: Various point combinations
      const testCases = [
        [{ lat: 12.9, lon: 77.5 }, { lat: 13.0, lon: 77.6 }],
        [{ lat: -12.9, lon: -77.5 }, { lat: -13.0, lon: -77.6 }],
        [{ lat: 0, lon: 0 }, { lat: 0, lon: 180 }],
      ];

      // Act & Assert
      testCases.forEach(([p1, p2]) => {
        const distance = haversineDistanceMeters(p1, p2);
        expect(distance).toBeGreaterThanOrEqual(0);
      });
    });
  });
});

describe('findNearestStop', () => {
  describe('basic functionality', () => {
    it('should return null for empty stop array', () => {
      // Arrange: Empty array
      const position = { lat: 12.9716, lon: 77.5946 };
      const stops: StopWithCoords[] = [];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return null when no stops available
      expect(result).toBeNull();
    });

    it('should return the only stop when array has single element', () => {
      // Arrange: Single stop
      const position = { lat: 12.9716, lon: 77.5946 };
      const stops: StopWithCoords[] = [
        { stopId: 'STOP_A', coords: { lat: 12.9722, lon: 77.5950 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return the single stop with calculated distance
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('STOP_A');
      expect(result!.distanceMeters).toBeGreaterThan(0);
      expect(result!.distanceMeters).toBeLessThan(100); // Should be close
    });

    it('should find the closest stop among multiple stops', () => {
      // Arrange: Current position and 3 stops at different distances
      const position = { lat: 12.9716, lon: 77.5946 }; // Reference point

      const stops: StopWithCoords[] = [
        // Stop A: ~500m away
        { stopId: 'STOP_A', coords: { lat: 12.9761, lon: 77.5946 } },
        // Stop B: ~100m away (CLOSEST)
        { stopId: 'STOP_B', coords: { lat: 12.9725, lon: 77.5946 } },
        // Stop C: ~1000m away
        { stopId: 'STOP_C', coords: { lat: 12.9806, lon: 77.5946 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return STOP_B (closest)
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('STOP_B');
      expect(result!.distanceMeters).toBeGreaterThan(95);
      expect(result!.distanceMeters).toBeLessThan(105);
    });

    it('should return exact distance to nearest stop', () => {
      // Arrange: Position and nearby stop
      const position = MG_ROAD_METRO;
      const stops: StopWithCoords[] = [
        { stopId: 'STOP_FAR', coords: KEMPEGOWDA_STATION },
        { stopId: 'STOP_NEAR', coords: { lat: 12.9765, lon: 77.6070 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return STOP_NEAR with accurate distance
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('STOP_NEAR');
      // Distance should be ~100-150m
      expect(result!.distanceMeters).toBeGreaterThan(50);
      expect(result!.distanceMeters).toBeLessThan(200);
    });
  });

  describe('tie-breaking', () => {
    it('should return first stop when two stops are equidistant', () => {
      // Arrange: Position with two stops at exact same distance
      const position = { lat: 12.9716, lon: 77.5946 };

      const stops: StopWithCoords[] = [
        // Stop A: 100m north
        { stopId: 'STOP_A', coords: { lat: 12.9725, lon: 77.5946 } },
        // Stop B: 100m south (same distance)
        { stopId: 'STOP_B', coords: { lat: 12.9707, lon: 77.5946 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return first stop (STOP_A) due to tie
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('STOP_A');
    });

    it('should handle multiple equidistant stops and return first', () => {
      // Arrange: 2 stops equidistant in N/S directions (lat offset = equal distance)
      const position = { lat: 12.9716, lon: 77.5946 };
      const offset = 0.0009; // ~100m

      const stops: StopWithCoords[] = [
        { stopId: 'NORTH', coords: { lat: 12.9716 + offset, lon: 77.5946 } },
        { stopId: 'SOUTH', coords: { lat: 12.9716 - offset, lon: 77.5946 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return first stop (NORTH) when equidistant
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('NORTH');
    });
  });

  describe('edge cases', () => {
    it('should handle position exactly at stop coordinates', () => {
      // Arrange: Position exactly matches a stop
      const position = { lat: 12.9716, lon: 77.5946 };
      const stops: StopWithCoords[] = [
        { stopId: 'STOP_EXACT', coords: { lat: 12.9716, lon: 77.5946 } },
        { stopId: 'STOP_FAR', coords: { lat: 12.9800, lon: 77.5800 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should return exact match with 0 distance
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('STOP_EXACT');
      expect(result!.distanceMeters).toBe(0);
    });

    it('should handle very large stop arrays efficiently', () => {
      // Arrange: 1000 stops scattered across Bangalore
      const position = MG_ROAD_METRO;
      const stops: StopWithCoords[] = [];

      for (let i = 0; i < 1000; i++) {
        stops.push({
          stopId: `STOP_${i}`,
          coords: {
            lat: 12.9 + Math.random() * 0.2, // 12.9-13.1
            lon: 77.5 + Math.random() * 0.2, // 77.5-77.7
          },
        });
      }

      // Add one very close stop
      stops.push({
        stopId: 'NEAREST',
        coords: { lat: position.lat + 0.0001, lon: position.lon + 0.0001 },
      });

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should find the nearest one
      expect(result).not.toBeNull();
      expect(result!.stopId).toBe('NEAREST');
      expect(result!.distanceMeters).toBeLessThan(20);
    });

    it('should handle stops at extreme distances', () => {
      // Arrange: Stops very far away (other side of Earth)
      const position = { lat: 12.9716, lon: 77.5946 }; // Bangalore
      const stops: StopWithCoords[] = [
        { stopId: 'ANTIPODE', coords: { lat: -12.9716, lon: -102.4054 } },
      ];

      // Act
      const result = findNearestStop(position, stops);

      // Assert: Should handle large distances
      expect(result).not.toBeNull();
      expect(result!.distanceMeters).toBeGreaterThan(10000000); // >10,000 km
    });
  });
});

describe('updateStopProximityState', () => {
  const RADIUS = 50; // 50 meter radius for all tests

  describe('entering stop proximity', () => {
    it('should transition from outside to inside when entering radius', () => {
      // Arrange: Start outside
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_123';
      const distanceMeters = 30; // Within 50m radius

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should transition to inside state
      expect(updated.kind).toBe('inside');
      expect((updated as any).stopId).toBe('STOP_123');
    });

    it('should stay outside when distance equals radius (boundary)', () => {
      // Arrange: Start outside
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_456';
      const distanceMeters = 50; // Exactly at boundary (not inside)

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should remain outside (boundary is exclusive)
      expect(updated.kind).toBe('outside');
    });

    it('should enter stop at distance 0 (exact match)', () => {
      // Arrange: Start outside, now exactly at stop
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_EXACT';
      const distanceMeters = 0; // Exactly at stop coordinates

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should transition to inside
      expect(updated.kind).toBe('inside');
      expect((updated as any).stopId).toBe('STOP_EXACT');
    });

    it('should stay outside when distance > radius', () => {
      // Arrange: Start outside, remain outside
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_FAR';
      const distanceMeters = 100; // Far from stop

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should remain outside
      expect(updated.kind).toBe('outside');
    });
  });

  describe('leaving stop proximity', () => {
    it('should transition from inside to outside when leaving radius', () => {
      // Arrange: Start inside STOP_A
      const previous: ProximityState = { kind: 'inside', stopId: 'STOP_A' };
      const stopId = 'STOP_A';
      const distanceMeters = 60; // Now outside 50m radius

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should transition to outside
      expect(updated.kind).toBe('outside');
    });

    it('should leave stop when distance equals radius (boundary)', () => {
      // Arrange: Inside STOP_B, now at boundary
      const previous: ProximityState = { kind: 'inside', stopId: 'STOP_B' };
      const stopId = 'STOP_B';
      const distanceMeters = 50; // At boundary

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should transition to outside (boundary is exclusive)
      expect(updated.kind).toBe('outside');
    });

    it('should stay inside when distance < radius', () => {
      // Arrange: Inside STOP_C, still inside
      const previous: ProximityState = { kind: 'inside', stopId: 'STOP_C' };
      const stopId = 'STOP_C';
      const distanceMeters = 25; // Still within radius

      // Act
      const updated = updateStopProximityState(previous, stopId, distanceMeters, RADIUS);

      // Assert: Should remain inside
      expect(updated.kind).toBe('inside');
      expect((updated as any).stopId).toBe('STOP_C');
    });

    it('should handle moving within stop radius (staying inside)', () => {
      // Arrange: Inside STOP_D, moving but staying within radius
      const previous: ProximityState = { kind: 'inside', stopId: 'STOP_D' };
      const stopId = 'STOP_D';

      // Act & Assert: Multiple updates within radius
      let state = updateStopProximityState(previous, stopId, 10, RADIUS);
      expect(state.kind).toBe('inside');

      state = updateStopProximityState(state, stopId, 20, RADIUS);
      expect(state.kind).toBe('inside');

      state = updateStopProximityState(state, stopId, 49, RADIUS);
      expect(state.kind).toBe('inside');
    });
  });

  describe('stop switching scenarios', () => {
    it('should switch to new stop when inside different stop', () => {
      // Arrange: Inside STOP_A, but now closer to STOP_B
      const previous: ProximityState = { kind: 'inside', stopId: 'STOP_A' };
      const newStopId = 'STOP_B';
      const distanceMeters = 20; // Within STOP_B radius

      // Act
      const updated = updateStopProximityState(previous, newStopId, distanceMeters, RADIUS);

      // Assert: Should switch to STOP_B
      expect(updated.kind).toBe('inside');
      expect((updated as any).stopId).toBe('STOP_B');
    });

    it('should leave old stop when approaching new stop outside radius', () => {
      // Arrange: Inside STOP_A, now checking distance to STOP_B (outside)
      const previous: ProximityState = { kind: 'inside', stopId: 'STOP_A' };
      const newStopId = 'STOP_B';
      const distanceMeters = 80; // Outside STOP_B radius

      // Act
      const updated = updateStopProximityState(previous, newStopId, distanceMeters, RADIUS);

      // Assert: Should transition to outside (left STOP_A, not in STOP_B)
      expect(updated.kind).toBe('outside');
    });

    it('should handle rapid stop switching (A -> B -> C)', () => {
      // Arrange: Start outside
      let state: ProximityState = { kind: 'outside' };

      // Act & Assert: Enter STOP_A
      state = updateStopProximityState(state, 'STOP_A', 20, RADIUS);
      expect(state.kind).toBe('inside');
      expect((state as any).stopId).toBe('STOP_A');

      // Switch to STOP_B
      state = updateStopProximityState(state, 'STOP_B', 30, RADIUS);
      expect(state.kind).toBe('inside');
      expect((state as any).stopId).toBe('STOP_B');

      // Switch to STOP_C
      state = updateStopProximityState(state, 'STOP_C', 15, RADIUS);
      expect(state.kind).toBe('inside');
      expect((state as any).stopId).toBe('STOP_C');

      // Leave all stops
      state = updateStopProximityState(state, 'STOP_C', 100, RADIUS);
      expect(state.kind).toBe('outside');
    });
  });

  describe('boundary conditions', () => {
    it('should handle radius of 0 (point proximity)', () => {
      // Arrange: Zero radius (only exact match)
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_ZERO';

      // Act: Distance 0 should enter
      let updated = updateStopProximityState(previous, stopId, 0, 0);
      expect(updated.kind).toBe('inside');

      // Any positive distance should be outside
      updated = updateStopProximityState(updated, stopId, 0.1, 0);
      expect(updated.kind).toBe('outside');
    });

    it('should handle very large radius (1km)', () => {
      // Arrange: 1000m radius
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_LARGE';
      const largeRadius = 1000;

      // Act: 999m should be inside
      const updated = updateStopProximityState(previous, stopId, 999, largeRadius);

      // Assert
      expect(updated.kind).toBe('inside');
    });

    it('should handle fractional meter distances', () => {
      // Arrange: Sub-meter precision
      const previous: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_PRECISE';

      // Act: 49.9m should be inside 50m radius
      const updated = updateStopProximityState(previous, stopId, 49.9, RADIUS);

      // Assert
      expect(updated.kind).toBe('inside');
    });

    it('should maintain state immutability', () => {
      // Arrange: Original state
      const original: ProximityState = { kind: 'outside' };

      // Act: Update state
      const updated = updateStopProximityState(original, 'STOP_X', 20, RADIUS);

      // Assert: Original should be unchanged
      expect(original.kind).toBe('outside');
      expect(updated.kind).toBe('inside');
      expect(original).not.toBe(updated); // Different objects
    });
  });

  describe('realistic ride scenarios', () => {
    it('should track complete stop visit cycle: approach -> enter -> dwell -> leave', () => {
      // Arrange: Start journey outside all stops
      let state: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_JOURNEY';

      // Act & Assert: Approach (100m -> 80m -> 60m)
      state = updateStopProximityState(state, stopId, 100, RADIUS);
      expect(state.kind).toBe('outside');

      state = updateStopProximityState(state, stopId, 80, RADIUS);
      expect(state.kind).toBe('outside');

      // Enter stop (40m)
      state = updateStopProximityState(state, stopId, 40, RADIUS);
      expect(state.kind).toBe('inside');
      expect((state as any).stopId).toBe(stopId);

      // Dwell at stop (20m -> 10m -> 25m)
      state = updateStopProximityState(state, stopId, 20, RADIUS);
      expect(state.kind).toBe('inside');

      state = updateStopProximityState(state, stopId, 10, RADIUS);
      expect(state.kind).toBe('inside');

      state = updateStopProximityState(state, stopId, 25, RADIUS);
      expect(state.kind).toBe('inside');

      // Leave stop (60m -> 100m)
      state = updateStopProximityState(state, stopId, 60, RADIUS);
      expect(state.kind).toBe('outside');

      state = updateStopProximityState(state, stopId, 100, RADIUS);
      expect(state.kind).toBe('outside');
    });

    it('should handle passing by stop without entering (tangential path)', () => {
      // Arrange: Start outside, pass by at 51m (just outside radius)
      let state: ProximityState = { kind: 'outside' };
      const stopId = 'STOP_BYPASS';

      // Act: Approach from 100m -> 60m -> 51m -> 60m -> 100m
      state = updateStopProximityState(state, stopId, 100, RADIUS);
      expect(state.kind).toBe('outside');

      state = updateStopProximityState(state, stopId, 60, RADIUS);
      expect(state.kind).toBe('outside');

      state = updateStopProximityState(state, stopId, 51, RADIUS); // Closest point
      expect(state.kind).toBe('outside');

      state = updateStopProximityState(state, stopId, 60, RADIUS);
      expect(state.kind).toBe('outside');

      state = updateStopProximityState(state, stopId, 100, RADIUS);
      expect(state.kind).toBe('outside');

      // Assert: Should never enter stop
      expect(state.kind).toBe('outside');
    });
  });
});

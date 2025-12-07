/**
 * Tests for useUserLocation hook
 *
 * This hook manages user location permission and current location state.
 * It integrates with expo-location to:
 * - Request location permissions
 * - Track permission status
 * - Get current location when permission is granted
 *
 * Expected behavior:
 * - Initial state has status 'unknown' and no location
 * - Provides requestPermission function
 */

import { renderHook, act } from '@testing-library/react-native';
import { useUserLocation } from '../useUserLocation';

describe('useUserLocation', () => {
  describe('Initial state', () => {
    it('should return initial state with status unknown', () => {
      const { result } = renderHook(() => useUserLocation());

      // Assert initial status is unknown
      expect(result.current.status).toBe('unknown');
    });

    it('should have no location initially', () => {
      const { result } = renderHook(() => useUserLocation());

      // Assert location is undefined initially
      expect(result.current.location).toBeUndefined();
    });
  });

  describe('requestPermission function', () => {
    it('should provide requestPermission function', () => {
      const { result } = renderHook(() => useUserLocation());

      // Assert requestPermission is a function
      expect(typeof result.current.requestPermission).toBe('function');
    });
  });
});

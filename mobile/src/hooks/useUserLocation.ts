/**
 * useUserLocation Hook
 *
 * Manages user location permission and current location state.
 * This hook will later integrate with expo-location to:
 * - Request location permissions
 * - Track permission status
 * - Get current location when permission is granted
 *
 * For now, this is a minimal implementation that provides the expected
 * interface for components without actually requesting permissions.
 */

import { useState } from 'react';

/**
 * Location permission status
 */
export type LocationPermissionStatus = 'unknown' | 'granted' | 'denied';

/**
 * Location coordinates (WGS84)
 */
export interface UserLocation {
  lat: number;
  lon: number;
}

/**
 * Return type for useUserLocation hook
 */
export interface UseUserLocationReturn {
  /** Current permission status */
  status: LocationPermissionStatus;
  /** Current user location (undefined if not available) */
  location: UserLocation | undefined;
  /** Function to request location permission */
  requestPermission: () => void;
}

/**
 * Hook to manage user location permission and current location
 *
 * @returns Location state and permission management functions
 *
 * @example
 * ```tsx
 * const { status, location, requestPermission } = useUserLocation();
 *
 * if (status === 'denied') {
 *   return <LocationPermissionBanner />;
 * }
 *
 * return <TransitMap userLocation={location} />;
 * ```
 */
export function useUserLocation(): UseUserLocationReturn {
  const [status, setStatus] = useState<LocationPermissionStatus>('unknown');
  const [location, setLocation] = useState<UserLocation | undefined>(undefined);

  const requestPermission = () => {
    // TODO: Implement actual permission request using expo-location
    // For now, this is a no-op placeholder
    console.log('Location permission request (not yet implemented)');
  };

  return {
    status,
    location,
    requestPermission,
  };
}

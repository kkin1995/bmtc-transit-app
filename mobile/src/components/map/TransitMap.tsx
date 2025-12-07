/**
 * TransitMap Component
 *
 * Renders the interactive map on the home screen.
 * Displays:
 * - User's current location (if permission granted)
 * - Destination stop marker (if selected)
 * - Journey route overlay (if journey selected)
 * - Nearby stops and routes
 *
 * This is currently a placeholder implementation. Full map integration
 * with react-native-maps will be added in a future iteration.
 */

import React from 'react';
import { YStack, Text } from 'tamagui';
import type { Stop } from '@/src/api/types';
import type { Journey } from '@/src/types';

/**
 * User location coordinates (WGS84)
 */
export interface UserLocation {
  lat: number;
  lon: number;
}

/**
 * Props for TransitMap component
 */
export interface TransitMapProps {
  /** User's current location (if permission granted) */
  userLocation?: UserLocation;
  /** Selected destination stop */
  destinationStop?: Stop;
  /** Selected journey for route overlay */
  selectedJourney?: Journey;
}

/**
 * Interactive transit map component
 *
 * @param props - Map configuration and overlay data
 * @returns Map view with user location, destination, and route
 *
 * @example
 * ```tsx
 * <TransitMap
 *   userLocation={{ lat: 12.9716, lon: 77.5946 }}
 *   destinationStop={destinationStop}
 *   selectedJourney={selectedJourney}
 * />
 * ```
 */
export function TransitMap({
  userLocation,
  destinationStop,
  selectedJourney,
}: TransitMapProps) {
  return (
    <YStack
      flex={1}
      backgroundColor="$gray3"
      alignItems="center"
      justifyContent="center"
      testID="transit-map"
    >
      <Text color="$gray10" fontSize="$6">
        Map
      </Text>
      <Text color="$gray9" fontSize="$3" marginTop="$2">
        (react-native-maps integration coming soon)
      </Text>
    </YStack>
  );
}

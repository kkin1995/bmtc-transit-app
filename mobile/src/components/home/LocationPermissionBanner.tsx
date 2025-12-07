/**
 * LocationPermissionBanner Component
 *
 * Displays a message when location permission is denied,
 * informing users they can still search manually.
 *
 * This banner appears at the top of the home screen when
 * location permission is denied or not granted.
 */

import React from 'react';
import { YStack, Text } from 'tamagui';

/**
 * Banner shown when location permission is denied
 *
 * @returns Info banner with permission message
 *
 * @example
 * ```tsx
 * {status === 'denied' && <LocationPermissionBanner />}
 * ```
 */
export function LocationPermissionBanner() {
  return (
    <YStack
      backgroundColor="$orange3"
      borderRadius="$3"
      padding="$3"
      margin="$4"
      marginBottom="$2"
      gap="$2"
    >
      <YStack gap="$1.5">
        <Text fontSize="$4" fontWeight="600" color="$orange11">
          Turn on location to see nearby stops
        </Text>
        <Text fontSize="$3" color="$orange10">
          You can still search manually
        </Text>
      </YStack>
    </YStack>
  );
}

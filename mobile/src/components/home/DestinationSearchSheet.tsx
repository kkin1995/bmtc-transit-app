/**
 * DestinationSearchSheet Component
 *
 * A bottom sheet that displays a list of nearby stops for destination selection.
 * Used in the trip planning flow on the home screen.
 *
 * Features:
 * - Shows list of stops with names
 * - Loading, error, and empty states
 * - Backdrop dismiss
 * - Purely presentational (no network calls)
 */

import React from 'react';
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui';
import { Pressable } from 'react-native';
import type { Stop } from '@/src/api/types';

/**
 * Props for DestinationSearchSheet component
 */
export interface DestinationSearchSheetProps {
  /** Whether the sheet is visible */
  visible: boolean;
  /** List of stops to display */
  stops: Stop[];
  /** Loading state indicator */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Callback when a stop is selected */
  onSelect: (stop: Stop) => void;
  /** Callback when sheet is dismissed */
  onClose: () => void;
}

/**
 * Bottom sheet for selecting a destination stop
 *
 * @param props - Component props
 * @returns Modal overlay with stop list
 *
 * @example
 * ```tsx
 * <DestinationSearchSheet
 *   visible={isSheetVisible}
 *   stops={nearbyStops}
 *   isLoading={isLoadingStops}
 *   error={errorMessage}
 *   onSelect={(stop) => handleStopSelected(stop)}
 *   onClose={() => setIsSheetVisible(false)}
 * />
 * ```
 */
export function DestinationSearchSheet({
  visible,
  stops,
  isLoading = false,
  error = null,
  onSelect,
  onClose,
}: DestinationSearchSheetProps) {
  // Don't render anything when not visible
  if (!visible) return null;

  /**
   * Render content based on current state
   * Priority: error > loading > empty > normal list
   */
  const renderContent = () => {
    // Error state takes highest priority
    if (error) {
      return (
        <YStack padding="$4" alignItems="center">
          <Text fontSize="$4" color="$red10">
            {error}
          </Text>
        </YStack>
      );
    }

    // Loading state takes second priority
    if (isLoading) {
      return (
        <YStack padding="$4" alignItems="center">
          <Text fontSize="$4" color="$gray11">
            Loading nearby stops…
          </Text>
        </YStack>
      );
    }

    // Empty state when no stops and not loading
    if (stops.length === 0) {
      return (
        <YStack padding="$4" alignItems="center">
          <Text fontSize="$4" color="$gray11">
            No stops found
          </Text>
        </YStack>
      );
    }

    // Normal state: render list of stops
    return (
      <ScrollView maxHeight={400}>
        {stops.map((stop) => (
          <Pressable
            key={stop.stop_id}
            onPress={() => onSelect(stop)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <YStack
              padding="$3"
              borderBottomWidth={1}
              borderBottomColor="$gray5"
            >
              <Text fontSize="$5">{stop.stop_name}</Text>
              <Text fontSize="$3" color="$gray10">
                ID: {stop.stop_id}
              </Text>
            </YStack>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={1000}
    >
      {/* Backdrop - dismisses sheet when pressed */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}
      />

      {/* Sheet container */}
      <YStack
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        backgroundColor="$background"
        borderTopLeftRadius="$4"
        borderTopRightRadius="$4"
        padding="$4"
        maxHeight="70%"
      >
        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          marginBottom="$3"
          paddingBottom="$2"
          borderBottomWidth={1}
          borderBottomColor="$gray5"
        >
          <Text fontSize="$6" fontWeight="600">
            Where to?
          </Text>
          <Button size="$3" onPress={onClose}>
            <Text>Close</Text>
          </Button>
        </XStack>

        {/* Content area */}
        {renderContent()}
      </YStack>
    </YStack>
  );
}

/**
 * WhereToBox Component
 *
 * Renders the "Where to?" search box that floats above the map
 * on the home screen.
 *
 * This is the primary entry point for trip planning - when tapped,
 * it triggers the destination selection flow.
 */

import React from 'react';
import { Button, XStack, Text } from 'tamagui';

/**
 * Props for WhereToBox component
 */
export interface WhereToBoxProps {
  /** Callback when the search box is tapped */
  onPress: () => void;
}

/**
 * Floating search box for destination entry
 *
 * @param props - Component props
 * @returns Pressable search box overlay
 *
 * @example
 * ```tsx
 * <WhereToBox onPress={() => beginDestinationSelection()} />
 * ```
 */
export function WhereToBox({ onPress }: WhereToBoxProps) {
  return (
    <Button
      position="absolute"
      top="$4"
      left="$4"
      right="$4"
      backgroundColor="$background"
      borderRadius="$4"
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 2 }}
      shadowOpacity={0.25}
      shadowRadius={8}
      elevation={5}
      pressStyle={{
        scale: 0.98,
        backgroundColor: '$gray2',
      }}
      onPress={onPress}
      height={56}
      justifyContent="flex-start"
    >
      <XStack gap="$3" alignItems="center" paddingLeft="$2">
        <Text fontSize="$5" color="$gray11">
          Where to?
        </Text>
      </XStack>
    </Button>
  );
}

/**
 * HomeLayout Component
 *
 * A consistent container structure using Tamagui primitives.
 * Provides a vertical stack layout (YStack) that fills available space.
 *
 * Usage:
 * ```tsx
 * <HomeLayout>
 *   <Text>Your content here</Text>
 * </HomeLayout>
 * ```
 *
 * This is a minimal infrastructure component that:
 * - Uses Tamagui's YStack for layout
 * - Fills the available space (flex: 1)
 * - Maintains all existing behavior
 * - Provides a foundation for future design system enhancements
 */

import React from 'react';
import { YStack } from 'tamagui';

export interface HomeLayoutProps {
  children: React.ReactNode;
  testID?: string;
}

export default function HomeLayout({ children, testID }: HomeLayoutProps) {
  return (
    <YStack flex={1} testID={testID}>
      {children}
    </YStack>
  );
}

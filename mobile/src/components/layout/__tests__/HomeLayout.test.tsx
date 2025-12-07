/**
 * Tests for HomeLayout component
 *
 * This layout component provides a consistent container structure
 * using Tamagui primitives (YStack) while maintaining all existing behavior.
 *
 * Expected behavior:
 * - Renders children components
 * - Uses Tamagui YStack as the outer container
 * - Provides flex: 1 to fill available space
 * - Maintains accessibility and testability
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import HomeLayout from '../HomeLayout';

// Tamagui components are mocked globally in jest-setup.js

describe('HomeLayout', () => {
  it('should render children components', () => {
    render(
      <HomeLayout>
        <Text>Test Child Content</Text>
      </HomeLayout>
    );

    expect(screen.getByText('Test Child Content')).toBeTruthy();
  });

  it('should use Tamagui YStack as the outer container', () => {
    render(
      <HomeLayout>
        <Text>Content</Text>
      </HomeLayout>
    );

    // Verify YStack is rendered (via testID from mock)
    expect(screen.getByTestId('tamagui-ystack')).toBeTruthy();
  });

  it('should render multiple children', () => {
    render(
      <HomeLayout>
        <Text>First Child</Text>
        <Text>Second Child</Text>
        <Text>Third Child</Text>
      </HomeLayout>
    );

    expect(screen.getByText('First Child')).toBeTruthy();
    expect(screen.getByText('Second Child')).toBeTruthy();
    expect(screen.getByText('Third Child')).toBeTruthy();
  });

  it('should accept and render null children without crashing', () => {
    render(
      <HomeLayout>
        {null}
      </HomeLayout>
    );

    // Should render the YStack container even with null children
    expect(screen.getByTestId('tamagui-ystack')).toBeTruthy();
  });

  it('should accept custom testID prop', () => {
    render(
      <HomeLayout testID="custom-layout">
        <Text>Content</Text>
      </HomeLayout>
    );

    expect(screen.getByTestId('custom-layout')).toBeTruthy();
  });
});

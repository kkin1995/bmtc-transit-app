/**
 * Tests for DestinationSearchSheet component
 *
 * This component renders a bottom sheet that allows users to search for
 * and select a destination stop for trip planning.
 *
 * Expected behavior:
 * - Only renders when visible === true
 * - Displays "Where to?" as the title (EXACT string)
 * - Shows list of nearby stops with their names
 * - Shows loading state with "Loading nearby stops…" (ellipsis character …)
 * - Shows error state when error prop is provided
 * - Calls onSelect with Stop object when a stop is tapped
 * - Calls onClose when close control with text "Close" is pressed
 * - Purely presentational (no network calls, no navigation)
 *
 * TDD Approach:
 * - These tests are written BEFORE the component exists (RED phase)
 * - Tests define the exact behavior and contract
 * - Implementation will be driven by making these tests pass (GREEN phase)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Stop } from '@/src/api/types';
import { DestinationSearchSheet } from '../DestinationSearchSheet';

/**
 * Factory function to create mock Stop objects for testing
 */
const createMockStop = (id: string, name: string): Stop => ({
  stop_id: id,
  stop_name: name,
  stop_lat: 12.9716,
  stop_lon: 77.5946,
  zone_id: null,
});

describe('DestinationSearchSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test 1: Renders list of stops when visible
  // ============================================================================

  it('should render list of stops when visible', () => {
    const mockStops: Stop[] = [
      createMockStop('1', 'Majestic'),
      createMockStop('2', 'Shivajinagar'),
      createMockStop('3', 'Kempegowda Bus Station'),
    ];

    render(
      <DestinationSearchSheet
        visible={true}
        stops={mockStops}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Assert exact title string
    expect(screen.getByText('Where to?')).toBeTruthy();

    // Assert all stop names are rendered
    expect(screen.getByText('Majestic')).toBeTruthy();
    expect(screen.getByText('Shivajinagar')).toBeTruthy();
    expect(screen.getByText('Kempegowda Bus Station')).toBeTruthy();
  });

  // ============================================================================
  // Test 2: Calls onSelect when a stop is tapped
  // ============================================================================

  it('should call onSelect with stop object when a stop is tapped', () => {
    const mockStop = createMockStop('123', 'Indiranagar');
    const mockOnSelect = jest.fn();

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[mockStop]}
        onSelect={mockOnSelect}
        onClose={jest.fn()}
      />
    );

    // Find and press the stop row
    const stopRow = screen.getByText('Indiranagar');
    fireEvent.press(stopRow);

    // Assert onSelect was called exactly once with the correct Stop object
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
    expect(mockOnSelect).toHaveBeenCalledWith(mockStop);
  });

  // ============================================================================
  // Test 3: Shows loading state with EXACT string
  // ============================================================================

  it('should show loading state with exact message', () => {
    render(
      <DestinationSearchSheet
        visible={true}
        stops={[]}
        isLoading={true}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Assert exact loading string with ellipsis character (…), not three dots (...)
    expect(screen.getByText('Loading nearby stops…')).toBeTruthy();
  });

  // ============================================================================
  // Test 4: Shows error state
  // ============================================================================

  it('should show error state when error prop is provided', () => {
    const errorMessage = 'Failed to fetch nearby stops';

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[]}
        error={errorMessage}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Assert the error message is displayed
    expect(screen.getByText(errorMessage)).toBeTruthy();
  });

  // ============================================================================
  // Test 5: Calls onClose when close control is pressed
  // ============================================================================

  it('should call onClose when close control is pressed', () => {
    const mockOnClose = jest.fn();

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[createMockStop('1', 'Majestic')]}
        onSelect={jest.fn()}
        onClose={mockOnClose}
      />
    );

    // Find and press the close control with exact text
    const closeButton = screen.getByText('Close');
    fireEvent.press(closeButton);

    // Assert onClose was called exactly once
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Test 6: Does not render when visible is false
  // ============================================================================

  it('should not render when visible is false', () => {
    render(
      <DestinationSearchSheet
        visible={false}
        stops={[createMockStop('1', 'Majestic')]}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Assert sheet content is NOT rendered
    // Using queryByText returns null if not found (unlike getByText which throws)
    expect(screen.queryByText('Where to?')).toBeNull();
    expect(screen.queryByText('Majestic')).toBeNull();
  });

  // ============================================================================
  // Test 7: Shows empty state when no stops and not loading
  // ============================================================================

  it('should show empty state when no stops available and not loading', () => {
    render(
      <DestinationSearchSheet
        visible={true}
        stops={[]}
        isLoading={false}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Title should still be visible
    expect(screen.getByText('Where to?')).toBeTruthy();

    // Loading message should NOT be shown
    expect(screen.queryByText('Loading nearby stops…')).toBeNull();

    // Some empty state message should be shown
    // Note: This test will guide implementation to show appropriate empty message
    // The actual message text can be determined during implementation
    // For now, we just verify the stops list is empty and no loading/error is shown
  });

  // ============================================================================
  // Test 8: Multiple stops can be tapped independently
  // ============================================================================

  it('should call onSelect with correct stop when different stops are tapped', () => {
    const mockStop1 = createMockStop('1', 'Majestic');
    const mockStop2 = createMockStop('2', 'Shivajinagar');
    const mockOnSelect = jest.fn();

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[mockStop1, mockStop2]}
        onSelect={mockOnSelect}
        onClose={jest.fn()}
      />
    );

    // Press first stop
    fireEvent.press(screen.getByText('Majestic'));
    expect(mockOnSelect).toHaveBeenCalledWith(mockStop1);

    // Clear mock to reset call count
    mockOnSelect.mockClear();

    // Press second stop
    fireEvent.press(screen.getByText('Shivajinagar'));
    expect(mockOnSelect).toHaveBeenCalledWith(mockStop2);
  });

  // ============================================================================
  // Test 9: Loading state takes precedence over empty state
  // ============================================================================

  it('should show loading state even when stops array is empty', () => {
    render(
      <DestinationSearchSheet
        visible={true}
        stops={[]}
        isLoading={true}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Loading message should be shown
    expect(screen.getByText('Loading nearby stops…')).toBeTruthy();
  });

  // ============================================================================
  // Test 10: Error state takes precedence over loading state
  // ============================================================================

  it('should show error state even when loading is true', () => {
    const errorMessage = 'Network error';

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[]}
        isLoading={true}
        error={errorMessage}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Error message should be shown
    expect(screen.getByText(errorMessage)).toBeTruthy();

    // Loading message should NOT be shown when there's an error
    expect(screen.queryByText('Loading nearby stops…')).toBeNull();
  });

  // ============================================================================
  // Test 11: Handles stops with long names
  // ============================================================================

  it('should render stops with long names correctly', () => {
    const longNameStop = createMockStop(
      '999',
      'Kempegowda International Airport Terminal 1 Bus Stop'
    );

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[longNameStop]}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(
      screen.getByText('Kempegowda International Airport Terminal 1 Bus Stop')
    ).toBeTruthy();
  });

  // ============================================================================
  // Test 12: Optional props have correct defaults
  // ============================================================================

  it('should handle optional props with default behavior', () => {
    const mockStops = [createMockStop('1', 'Majestic')];

    // Render without isLoading and error props (should default to undefined/false)
    render(
      <DestinationSearchSheet
        visible={true}
        stops={mockStops}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Should show normal list, not loading or error
    expect(screen.getByText('Majestic')).toBeTruthy();
    expect(screen.queryByText('Loading nearby stops…')).toBeNull();
  });

  // ============================================================================
  // Test 13: Preserves stop data integrity
  // ============================================================================

  it('should preserve all stop properties when calling onSelect', () => {
    const mockStop: Stop = {
      stop_id: 'STOP_12345',
      stop_name: 'Test Stop',
      stop_lat: 12.9716,
      stop_lon: 77.5946,
      zone_id: 'ZONE_1',
    };
    const mockOnSelect = jest.fn();

    render(
      <DestinationSearchSheet
        visible={true}
        stops={[mockStop]}
        onSelect={mockOnSelect}
        onClose={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Test Stop'));

    // Verify the exact stop object is passed (not just a subset)
    expect(mockOnSelect).toHaveBeenCalledWith(mockStop);
    expect(mockOnSelect.mock.calls[0][0]).toEqual({
      stop_id: 'STOP_12345',
      stop_name: 'Test Stop',
      stop_lat: 12.9716,
      stop_lon: 77.5946,
      zone_id: 'ZONE_1',
    });
  });
});

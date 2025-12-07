/**
 * Tests for WhereToBox component
 *
 * This component renders the "Where to?" search box that floats
 * above the map on the home screen.
 *
 * Expected behavior:
 * - Renders "Where to?" text
 * - Calls onPress handler when tapped
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { WhereToBox } from '../WhereToBox';

describe('WhereToBox', () => {
  it('should render "Where to?" text', () => {
    render(<WhereToBox onPress={jest.fn()} />);

    // Assert "Where to?" text is visible
    expect(screen.getByText('Where to?')).toBeTruthy();
  });

  it('should call onPress when tapped', () => {
    const mockOnPress = jest.fn();

    render(<WhereToBox onPress={mockOnPress} />);

    // Find and press the button
    const button = screen.getByText('Where to?');
    fireEvent.press(button);

    // Assert onPress was called exactly once
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});

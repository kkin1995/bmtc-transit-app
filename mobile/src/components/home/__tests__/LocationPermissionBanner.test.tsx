/**
 * Tests for LocationPermissionBanner component
 *
 * This component displays a message when location permission is denied,
 * informing users they can still search manually.
 *
 * Expected behavior:
 * - Renders permission message
 * - Renders manual search hint
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { LocationPermissionBanner } from '../LocationPermissionBanner';

describe('LocationPermissionBanner', () => {
  it('should render permission message', () => {
    render(<LocationPermissionBanner />);

    // Assert main permission message is visible
    expect(screen.getByText('Turn on location to see nearby stops')).toBeTruthy();
  });

  it('should render manual search hint', () => {
    render(<LocationPermissionBanner />);

    // Assert manual search hint is visible
    expect(screen.getByText('You can still search manually')).toBeTruthy();
  });
});

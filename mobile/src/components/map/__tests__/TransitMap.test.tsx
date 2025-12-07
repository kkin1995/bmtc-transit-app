/**
 * Tests for TransitMap component
 *
 * This component renders the interactive map on the home screen.
 * It displays:
 * - User's current location (if permission granted)
 * - Destination stop marker (if selected)
 * - Journey route overlay (if journey selected)
 * - Nearby stops and routes
 *
 * Expected behavior:
 * - Renders without crashing with no props
 * - Has testID for identification
 * - Accepts optional userLocation prop
 * - Accepts optional destinationStop prop
 * - Accepts optional selectedJourney prop
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TransitMap } from '../TransitMap';
import type { Stop } from '@/src/api/types';
import type { Journey } from '@/src/types';

// Mock data
const mockUserLocation = {
  lat: 12.9716,
  lon: 77.5946,
};

const mockDestinationStop: Stop = {
  stop_id: '12345',
  stop_name: 'Electronic City',
  stop_lat: 12.8456,
  stop_lon: 77.6603,
  zone_id: null,
};

const mockSelectedJourney: Journey = {
  id: 'journey-1',
  route: {
    route_id: '335E',
    route_short_name: '335E',
    route_long_name: 'Kengeri to Whitefield',
    route_type: 3,
    agency_id: 'BMTC',
  },
  fromStop: {
    stop_id: '20558',
    stop_name: 'Majestic',
    stop_lat: 12.9716,
    stop_lon: 77.5946,
    zone_id: null,
  },
  toStop: {
    stop_id: '29374',
    stop_name: 'Electronic City',
    stop_lat: 12.8456,
    stop_lon: 77.6603,
    zone_id: null,
  },
  directionId: 0,
  confidence: 'high',
  walkingDistanceM: 250,
  predictedTravelSec: 1800,
};

describe('TransitMap', () => {
  it('should render without crashing', () => {
    // Render with no props - component should handle this gracefully
    const { root } = render(<TransitMap />);
    expect(root).toBeTruthy();
  });

  it('should have testID for identification', () => {
    render(<TransitMap />);

    // Assert testID exists
    expect(screen.getByTestId('transit-map')).toBeTruthy();
  });

  it('should accept userLocation prop', () => {
    // Render with userLocation prop - should not throw
    expect(() => {
      render(<TransitMap userLocation={mockUserLocation} />);
    }).not.toThrow();
  });

  it('should accept destinationStop prop', () => {
    // Render with destinationStop prop - should not throw
    expect(() => {
      render(<TransitMap destinationStop={mockDestinationStop} />);
    }).not.toThrow();
  });

  it('should accept selectedJourney prop', () => {
    // Render with selectedJourney prop - should not throw
    expect(() => {
      render(<TransitMap selectedJourney={mockSelectedJourney} />);
    }).not.toThrow();
  });
});

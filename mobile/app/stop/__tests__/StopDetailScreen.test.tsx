/**
 * Tests for Stop Detail Screen ([stopId].tsx)
 *
 * Expected behavior:
 * - Reads stopId and stopName from useLocalSearchParams
 * - Uses useStopSchedule hook with stopId and time_window_minutes: 60
 * - Renders stop header with stop_name, stop_id, coordinates
 * - Shows loading indicator with "Loading departures..." when loading
 * - Shows error message with "Retry" button when error occurs
 * - Shows empty state "No departures scheduled..." with "Refresh" button
 * - Renders FlatList of departures when data available
 * - Each departure shows: route_id badge, departure_time (formatted), headsign, service_id, direction_id
 * - Tapping departure navigates to /eta with correct params
 * - Shows query time formatted as locale time string
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import StopDetailScreen from '../[stopId]';
import * as hooks from '@/src/hooks';

// Mock hooks and router
jest.mock('@/src/hooks');
jest.mock('expo-router');

const mockUseStopSchedule = hooks.useStopSchedule as jest.MockedFunction<
  typeof hooks.useStopSchedule
>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('StopDetailScreen', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
  });

  it('should use stopId from params', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
      stopName: 'Majestic',
    } as any);

    mockUseStopSchedule.mockReturnValue({
      stop: undefined,
      departures: [],
      queryTime: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    // Verify useStopSchedule was called with correct params
    expect(mockUseStopSchedule).toHaveBeenCalledWith('20558', {
      time_window_minutes: 60,
    });
  });

  it('should show loading state', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
    } as any);

    mockUseStopSchedule.mockReturnValue({
      stop: undefined,
      departures: [],
      queryTime: undefined,
      data: undefined,
      loading: true,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    expect(screen.getByText('Loading departures...')).toBeTruthy();
  });

  it('should show error state with retry button', () => {
    const mockReload = jest.fn();

    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
    } as any);

    mockUseStopSchedule.mockReturnValue({
      stop: undefined,
      departures: [],
      queryTime: undefined,
      data: undefined,
      loading: false,
      error: { message: 'Stop not found', code: 'not_found' },
      reload: mockReload,
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    expect(screen.getByText(/Error: Stop not found/)).toBeTruthy();

    const retryButton = screen.getByText('Retry');
    fireEvent.press(retryButton);

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('should show empty state with refresh button', () => {
    const mockReload = jest.fn();

    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
    } as any);

    mockUseStopSchedule.mockReturnValue({
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: [],
      queryTime: '2025-11-18T03:00:00Z',
      data: undefined,
      loading: false,
      error: undefined,
      reload: mockReload,
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    expect(screen.getByText('No departures scheduled in the next hour')).toBeTruthy();

    const refreshButton = screen.getByText('Refresh');
    fireEvent.press(refreshButton);

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('should render stop header when stop data is available', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
      stopName: 'Majestic',
    } as any);

    mockUseStopSchedule.mockReturnValue({
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: [],
      queryTime: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    expect(screen.getByText('Majestic')).toBeTruthy();
    expect(screen.getByText('Stop ID: 20558')).toBeTruthy();
    expect(screen.getByText('12.97670, 77.57130')).toBeTruthy();
  });

  it('should render list of departures', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
    } as any);

    const mockDepartures = [
      {
        trip: {
          trip_id: 'trip1',
          route_id: '335E',
          service_id: 'WEEKDAY',
          trip_headsign: 'Electronic City',
          direction_id: 0,
        },
        stop_time: {
          arrival_time: '14:30:00',
          departure_time: '14:30:00',
          stop_sequence: 1,
          pickup_type: null,
          drop_off_type: null,
        },
      },
      {
        trip: {
          trip_id: 'trip2',
          route_id: '340',
          service_id: 'WEEKEND',
          trip_headsign: 'Whitefield',
          direction_id: 1,
        },
        stop_time: {
          arrival_time: '14:45:30',
          departure_time: '14:45:30',
          stop_sequence: 5,
          pickup_type: null,
          drop_off_type: null,
        },
      },
    ];

    mockUseStopSchedule.mockReturnValue({
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: mockDepartures,
      queryTime: '2025-11-18T14:00:00Z',
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    // Check section title
    expect(screen.getByText('Upcoming Departures')).toBeTruthy();

    // Check route badges
    expect(screen.getByText('335E')).toBeTruthy();
    expect(screen.getByText('340')).toBeTruthy();

    // Check formatted departure times (HH:MM format)
    expect(screen.getByText('14:30')).toBeTruthy();
    expect(screen.getByText('14:45')).toBeTruthy();

    // Check headsigns
    expect(screen.getByText('→ Electronic City')).toBeTruthy();
    expect(screen.getByText('→ Whitefield')).toBeTruthy();

    // Check service IDs
    expect(screen.getByText('Service: WEEKDAY')).toBeTruthy();
    expect(screen.getByText('Service: WEEKEND')).toBeTruthy();

    // Check direction IDs
    expect(screen.getByText('Direction: 0')).toBeTruthy();
    expect(screen.getByText('Direction: 1')).toBeTruthy();
  });

  it('should navigate to ETA screen when departure is tapped', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
      stopName: 'Majestic',
    } as any);

    const mockDepartures = [
      {
        trip: {
          trip_id: 'trip1',
          route_id: '335E',
          service_id: 'WEEKDAY',
          trip_headsign: 'Electronic City',
          direction_id: 0,
        },
        stop_time: {
          arrival_time: '14:30:00',
          departure_time: '14:30:00',
          stop_sequence: 1,
          pickup_type: null,
          drop_off_type: null,
        },
      },
    ];

    mockUseStopSchedule.mockReturnValue({
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: mockDepartures,
      queryTime: '2025-11-18T14:00:00Z',
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    // Tap the departure
    const departureItem = screen.getByText('→ Electronic City');
    fireEvent.press(departureItem);

    // Verify navigation with correct params
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/eta',
      params: {
        route_id: '335E',
        direction_id: '0',
        from_stop_id: '20558',
        to_stop_id: '20558', // TODO: Should be actual destination
        from_name: 'Majestic',
        to_name: 'Electronic City',
      },
    });
  });

  it('should handle departure with null direction_id', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
    } as any);

    const mockDepartures = [
      {
        trip: {
          trip_id: 'trip1',
          route_id: '335E',
          service_id: 'WEEKDAY',
          trip_headsign: 'Electronic City',
          direction_id: null,
        },
        stop_time: {
          arrival_time: '14:30:00',
          departure_time: '14:30:00',
          stop_sequence: 1,
          pickup_type: null,
          drop_off_type: null,
        },
      },
    ];

    mockUseStopSchedule.mockReturnValue({
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: mockDepartures,
      queryTime: '2025-11-18T14:00:00Z',
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    // Should display "N/A" for null direction_id
    expect(screen.getByText('Direction: N/A')).toBeTruthy();

    // Should still navigate with direction_id='0' as fallback
    const departureItem = screen.getByText('→ Electronic City');
    fireEvent.press(departureItem);

    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          direction_id: '0',
        }),
      })
    );
  });

  it('should show query time', () => {
    mockUseLocalSearchParams.mockReturnValue({
      stopId: '20558',
    } as any);

    mockUseStopSchedule.mockReturnValue({
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: [
        {
          trip: {
            trip_id: 'trip1',
            route_id: '335E',
            service_id: 'WEEKDAY',
            trip_headsign: 'Electronic City',
            direction_id: 0,
          },
          stop_time: {
            arrival_time: '14:30:00',
            departure_time: '14:30:00',
            stop_sequence: 1,
            pickup_type: null,
            drop_off_type: null,
          },
        },
      ],
      queryTime: '2025-11-18T14:00:00Z',
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<StopDetailScreen />);

    // Should show "As of" with formatted time
    // Note: toLocaleTimeString output varies by environment, so we check for the prefix
    const queryTimeElement = screen.getByText(/As of/);
    expect(queryTimeElement).toBeTruthy();
  });
});

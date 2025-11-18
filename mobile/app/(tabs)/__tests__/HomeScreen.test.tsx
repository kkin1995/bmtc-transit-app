/**
 * Tests for Home Screen (index.tsx)
 *
 * Expected behavior:
 * - Renders "BMTC Transit" title
 * - Uses useStops hook with limit: 20
 * - Shows loading indicator with "Loading stops..." when loading
 * - Shows error message with "Retry" button when error occurs
 * - Shows "No stops found" when stops array is empty
 * - Renders FlatList of stops when data is available
 * - Each stop item shows: stop_name, stop_id, coordinates
 * - Tapping a stop navigates to /stop/[stopId] with params
 * - Pressing retry button calls reload() function
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import HomeScreen from '../index';
import * as hooks from '@/src/hooks';

// Mock hooks
jest.mock('@/src/hooks');
jest.mock('expo-router');

const mockUseStops = hooks.useStops as jest.MockedFunction<typeof hooks.useStops>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('HomeScreen', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
  });

  it('should render title', () => {
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText('BMTC Transit')).toBeTruthy();
  });

  it('should call useStops with limit: 20', () => {
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(mockUseStops).toHaveBeenCalledWith({ limit: 20 });
  });

  it('should show loading state', () => {
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: true,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText('Loading stops...')).toBeTruthy();
    // ActivityIndicator is rendered (we can't easily test its presence without testID)
  });

  it('should show error state with retry button', () => {
    const mockReload = jest.fn();

    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: { message: 'Network error', code: 'network_error' },
      reload: mockReload,
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText(/Error: Network error/)).toBeTruthy();

    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeTruthy();

    fireEvent.press(retryButton);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('should show empty state when no stops', () => {
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText('No stops found')).toBeTruthy();
  });

  it('should render list of stops', () => {
    const mockStops = [
      {
        stop_id: '1',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
        zone_id: null,
      },
      {
        stop_id: '2',
        stop_name: 'Shivajinagar',
        stop_lat: 12.9854,
        stop_lon: 77.6081,
        zone_id: 'Z1',
      },
    ];

    mockUseStops.mockReturnValue({
      stops: mockStops,
      total: 2,
      limit: 20,
      offset: 0,
      data: { stops: mockStops, total: 2, limit: 20, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    // Check subtitle
    expect(screen.getByText('Nearby Stops')).toBeTruthy();

    // Check stop names
    expect(screen.getByText('Majestic')).toBeTruthy();
    expect(screen.getByText('Shivajinagar')).toBeTruthy();

    // Check stop IDs
    expect(screen.getByText('ID: 1')).toBeTruthy();
    expect(screen.getByText('ID: 2')).toBeTruthy();

    // Check coordinates (formatted)
    expect(screen.getByText('12.97670, 77.57130')).toBeTruthy();
    expect(screen.getByText('12.98540, 77.60810')).toBeTruthy();
  });

  it('should navigate to stop detail when stop is pressed', () => {
    const mockStops = [
      {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
        zone_id: null,
      },
    ];

    mockUseStops.mockReturnValue({
      stops: mockStops,
      total: 1,
      limit: 20,
      offset: 0,
      data: { stops: mockStops, total: 1, limit: 20, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    // Find and press the stop item
    const stopItem = screen.getByText('Majestic');
    fireEvent.press(stopItem);

    // Verify navigation was called with correct params
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/stop/[stopId]',
      params: {
        stopId: '20558',
        stopName: 'Majestic',
      },
    });
  });

  it('should handle multiple stops and navigate correctly', () => {
    const mockStops = [
      {
        stop_id: '1',
        stop_name: 'Stop One',
        stop_lat: 12.9,
        stop_lon: 77.5,
        zone_id: null,
      },
      {
        stop_id: '2',
        stop_name: 'Stop Two',
        stop_lat: 13.0,
        stop_lon: 77.6,
        zone_id: null,
      },
    ];

    mockUseStops.mockReturnValue({
      stops: mockStops,
      total: 2,
      limit: 20,
      offset: 0,
      data: { stops: mockStops, total: 2, limit: 20, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    // Press first stop
    fireEvent.press(screen.getByText('Stop One'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/stop/[stopId]',
      params: {
        stopId: '1',
        stopName: 'Stop One',
      },
    });

    // Press second stop
    fireEvent.press(screen.getByText('Stop Two'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/stop/[stopId]',
      params: {
        stopId: '2',
        stopName: 'Stop Two',
      },
    });

    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });
});

/**
 * Tests for ETA Screen (eta/index.tsx)
 *
 * Expected behavior:
 * - Reads route_id, direction_id, from_stop_id, to_stop_id, from_name, to_name from useLocalSearchParams
 * - Converts direction_id string to number
 * - Uses useEta hook with parsed params
 * - Shows segment info card with from/to stops and direction
 * - Shows missing params warning when missingParams=true
 * - Shows loading indicator with "Fetching ETA..." when loading
 * - Shows error message with "Retry" button when error occurs
 * - Renders scheduled GTFS section with duration, service_id, source
 * - Renders ML prediction section with:
 *   - predicted_duration_sec, p50_sec, p90_sec
 *   - confidence badge (color-coded)
 *   - blend_weight, samples_used, bin_id, last_updated, model_version
 * - Shows query time at bottom
 * - Formats durations correctly (seconds to human-readable)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import EtaScreen from '../index';
import * as hooks from '@/src/hooks';

// Mock hooks and router
jest.mock('@/src/hooks');
jest.mock('expo-router');

const mockUseEta = hooks.useEta as jest.MockedFunction<typeof hooks.useEta>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;

describe('EtaScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read params and call useEta with parsed direction_id', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
      from_name: 'Majestic',
      to_name: 'Electronic City',
    } as any);

    mockUseEta.mockReturnValue({
      segment: undefined,
      queryTime: undefined,
      scheduled: undefined,
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    // Verify useEta was called with correct params (direction_id as number)
    expect(mockUseEta).toHaveBeenCalledWith({
      route_id: '335E',
      direction_id: 0, // Should be converted to number
      from_stop_id: '20558',
      to_stop_id: '29374',
    });
  });

  it('should display segment info card', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
      from_name: 'Majestic',
      to_name: 'Electronic City',
    } as any);

    mockUseEta.mockReturnValue({
      segment: undefined,
      queryTime: undefined,
      scheduled: undefined,
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    // Check segment header
    expect(screen.getByText('Segment')).toBeTruthy();
    expect(screen.getByText('335E')).toBeTruthy();

    // Check from/to stops
    expect(screen.getByText('Majestic')).toBeTruthy();
    expect(screen.getByText('Electronic City')).toBeTruthy();

    // Check direction
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('should show missing params warning', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      // Missing other params
    } as any);

    mockUseEta.mockReturnValue({
      segment: undefined,
      queryTime: undefined,
      scheduled: undefined,
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: true,
    });

    render(<EtaScreen />);

    expect(
      screen.getByText(/Missing required parameters/)
    ).toBeTruthy();
  });

  it('should show loading state', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    mockUseEta.mockReturnValue({
      segment: undefined,
      queryTime: undefined,
      scheduled: undefined,
      prediction: undefined,
      data: undefined,
      loading: true,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    expect(screen.getByText('Fetching ETA...')).toBeTruthy();
  });

  it('should show error state with retry button', () => {
    const mockReload = jest.fn();

    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    mockUseEta.mockReturnValue({
      segment: undefined,
      queryTime: undefined,
      scheduled: undefined,
      prediction: undefined,
      data: undefined,
      loading: false,
      error: { message: 'Segment not found', code: 'not_found' },
      reload: mockReload,
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    expect(screen.getByText(/Error: Segment not found/)).toBeTruthy();

    const retryButton = screen.getByText('Retry');
    fireEvent.press(retryButton);

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('should render scheduled GTFS section', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 1800, // 30 minutes
        service_id: 'WEEKDAY',
        source: 'gtfs',
      },
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    // Check section title
    expect(screen.getByText('Scheduled (GTFS)')).toBeTruthy();

    // Check formatted duration (30 minutes)
    expect(screen.getByText('30m')).toBeTruthy();

    // Check service ID
    expect(screen.getByText('WEEKDAY')).toBeTruthy();

    // Check source
    expect(screen.getByText('gtfs')).toBeTruthy();
  });

  it('should render ML prediction section', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 1800,
        source: 'gtfs',
      },
      prediction: {
        predicted_duration_sec: 1650, // 27 minutes 30 seconds
        p50_sec: 1600, // 26 minutes 40 seconds
        p90_sec: 2000, // 33 minutes 20 seconds
        confidence: 'high',
        blend_weight: 0.75,
        samples_used: 150,
        bin_id: 56,
        last_updated: '2025-11-18T13:55:00Z',
        model_version: 'v1.0',
      },
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    // Check section title
    expect(screen.getByText('ML Prediction')).toBeTruthy();

    // Check predicted duration
    expect(screen.getByText('27m 30s')).toBeTruthy();

    // Check percentiles
    expect(screen.getByText('P50 (Median)')).toBeTruthy();
    expect(screen.getByText('26m 40s')).toBeTruthy();
    expect(screen.getByText('P90')).toBeTruthy();
    expect(screen.getByText('33m 20s')).toBeTruthy();

    // Check confidence (uppercase)
    expect(screen.getByText('HIGH')).toBeTruthy();

    // Check blend weight (formatted as percentage)
    expect(screen.getByText('75.0%')).toBeTruthy();

    // Check samples used
    expect(screen.getByText('150')).toBeTruthy();

    // Check bin ID
    expect(screen.getByText('56')).toBeTruthy();

    // Check model version
    expect(screen.getByText('v1.0')).toBeTruthy();
  });

  it('should format duration correctly for different values', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    // Test case: less than 1 minute
    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 45, // 45 seconds
        source: 'gtfs',
      },
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    const { rerender } = render(<EtaScreen />);

    // Should show seconds
    expect(screen.getByText('45s')).toBeTruthy();

    // Test case: exactly 1 hour
    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 3600, // 1 hour
        source: 'gtfs',
      },
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    rerender(<EtaScreen />);

    // Should show hours
    expect(screen.getByText('1h')).toBeTruthy();

    // Test case: 1 hour 30 minutes
    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 5400, // 1 hour 30 minutes
        source: 'gtfs',
      },
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    rerender(<EtaScreen />);

    // Should show hours and minutes
    expect(screen.getByText('1h 30m')).toBeTruthy();
  });

  it('should display confidence with correct color', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    // Test high confidence
    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: undefined,
      prediction: {
        predicted_duration_sec: 1650,
        p50_sec: 1600,
        p90_sec: 2000,
        confidence: 'high',
        blend_weight: 0.75,
        samples_used: 150,
        bin_id: 56,
        last_updated: '2025-11-18T13:55:00Z',
        model_version: 'v1.0',
      },
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    // High confidence should be displayed
    expect(screen.getByText('HIGH')).toBeTruthy();

    // Note: We can't easily test background color with current setup,
    // but the confidence badge should be rendered
  });

  it('should show query time', () => {
    mockUseLocalSearchParams.mockReturnValue({
      route_id: '335E',
      direction_id: '0',
      from_stop_id: '20558',
      to_stop_id: '29374',
    } as any);

    mockUseEta.mockReturnValue({
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      queryTime: '2025-11-18T14:00:00Z',
      scheduled: undefined,
      prediction: undefined,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
      missingParams: false,
    });

    render(<EtaScreen />);

    // Should show "Query time:" prefix
    const queryTimeElement = screen.getByText(/Query time:/);
    expect(queryTimeElement).toBeTruthy();
  });
});

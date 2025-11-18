/**
 * Tests for useStopSchedule hook
 *
 * Expected behavior:
 * - Does NOT call fetchStopSchedule if stopId is missing/falsy
 * - Calls fetchStopSchedule(stopId, params) when stopId is provided
 * - Returns { stop, departures, queryTime, data, loading, error, reload, isRefreshing }
 * - When stopId is missing: loading=false, error=undefined, departures=[]
 * - Handles success state with departures list
 * - Handles error state
 * - Supports reload() function
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useStopSchedule } from '../useStopSchedule';
import * as apiClient from '@/src/api/client';

// Mock the API client
jest.mock('@/src/api/client');

const mockFetchStopSchedule = apiClient.fetchStopSchedule as jest.MockedFunction<
  typeof apiClient.fetchStopSchedule
>;

describe('useStopSchedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should NOT call fetchStopSchedule when stopId is undefined', async () => {
    const { result } = renderHook(() => useStopSchedule(undefined));

    // Should not be loading
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.departures).toEqual([]);

    // Wait a bit to ensure no API call is made
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify fetchStopSchedule was NOT called
    expect(mockFetchStopSchedule).not.toHaveBeenCalled();
  });

  it('should NOT call fetchStopSchedule when stopId is null', async () => {
    const { result } = renderHook(() => useStopSchedule(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.departures).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFetchStopSchedule).not.toHaveBeenCalled();
  });

  it('should NOT call fetchStopSchedule when stopId is empty string', async () => {
    const { result } = renderHook(() => useStopSchedule(''));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.departures).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFetchStopSchedule).not.toHaveBeenCalled();
  });

  it('should call fetchStopSchedule when stopId is provided', async () => {
    const mockResponse = {
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
      query_time: '2025-11-18T14:00:00Z',
    };

    mockFetchStopSchedule.mockResolvedValue(mockResponse);

    const { result } = renderHook(() =>
      useStopSchedule('20558', { time_window_minutes: 60 })
    );

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for API call to complete
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify fetchStopSchedule was called with correct params
    expect(mockFetchStopSchedule).toHaveBeenCalledTimes(1);
    expect(mockFetchStopSchedule).toHaveBeenCalledWith('20558', { time_window_minutes: 60 });
  });

  it('should return schedule data on success', async () => {
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
          service_id: 'WEEKDAY',
          trip_headsign: 'Whitefield',
          direction_id: 1,
        },
        stop_time: {
          arrival_time: '14:45:00',
          departure_time: '14:45:00',
          stop_sequence: 5,
          pickup_type: null,
          drop_off_type: null,
        },
      },
    ];

    const mockStop = {
      stop_id: '20558',
      stop_name: 'Majestic',
      stop_lat: 12.9767,
      stop_lon: 77.5713,
    };

    const mockResponse = {
      stop: mockStop,
      departures: mockDepartures,
      query_time: '2025-11-18T14:00:00Z',
    };

    mockFetchStopSchedule.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStopSchedule('20558'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify success state
    expect(result.current.stop).toEqual(mockStop);
    expect(result.current.departures).toEqual(mockDepartures);
    expect(result.current.queryTime).toBe('2025-11-18T14:00:00Z');
    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeUndefined();
  });

  it('should handle error state', async () => {
    const mockError = new Error('Stop not found');
    mockFetchStopSchedule.mockRejectedValue(mockError);

    const { result } = renderHook(() => useStopSchedule('invalid-stop'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.departures).toEqual([]);
    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBeTruthy();
    expect(result.current.data).toBeUndefined();
  });

  it('should support reload functionality', async () => {
    const mockResponse = {
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: [],
      query_time: '2025-11-18T14:00:00Z',
    };

    mockFetchStopSchedule.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStopSchedule('20558'));

    // Wait for initial load
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchStopSchedule).toHaveBeenCalledTimes(1);

    // Trigger reload
    result.current.reload();

    // Should call fetchStopSchedule again
    await waitFor(() => expect(mockFetchStopSchedule).toHaveBeenCalledTimes(2));
  });

  it('should handle filtering by route_id', async () => {
    const mockResponse = {
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: [],
      query_time: '2025-11-18T14:00:00Z',
    };

    mockFetchStopSchedule.mockResolvedValue(mockResponse);

    const params = {
      route_id: '335E',
      time_window_minutes: 120,
    };

    renderHook(() => useStopSchedule('20558', params));

    await waitFor(() => expect(mockFetchStopSchedule).toHaveBeenCalled());

    // Verify params were passed correctly
    expect(mockFetchStopSchedule).toHaveBeenCalledWith('20558', params);
  });

  it('should return empty departures when no schedules found', async () => {
    const mockResponse = {
      stop: {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
      },
      departures: [],
      query_time: '2025-11-18T03:00:00Z',
    };

    mockFetchStopSchedule.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStopSchedule('20558'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.departures).toEqual([]);
    expect(result.current.stop).toBeDefined();
  });
});

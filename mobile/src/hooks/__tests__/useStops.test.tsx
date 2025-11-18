/**
 * Tests for useStops hook
 *
 * Expected behavior:
 * - Calls fetchStops with provided params on mount
 * - Returns { stops, total, limit, offset, data, loading, error, reload, isRefreshing }
 * - Handles success state (data populated, loading false, error undefined)
 * - Handles loading state (loading true, data undefined)
 * - Handles error state (error populated, data undefined, loading false)
 * - Supports reload() function to refetch data
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useStops } from '../useStops';
import * as apiClient from '@/src/api/client';

// Mock the API client
jest.mock('@/src/api/client');

const mockFetchStops = apiClient.fetchStops as jest.MockedFunction<typeof apiClient.fetchStops>;

describe('useStops', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call fetchStops with params on mount', async () => {
    const mockResponse = {
      stops: [
        { stop_id: '1', stop_name: 'Stop 1', stop_lat: 12.9, stop_lon: 77.5, zone_id: null },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };

    mockFetchStops.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStops({ limit: 20 }));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.stops).toEqual([]);

    // Wait for API call to complete
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify fetchStops was called
    expect(mockFetchStops).toHaveBeenCalledTimes(1);
    expect(mockFetchStops).toHaveBeenCalledWith({ limit: 20 });
  });

  it('should return stops data on success', async () => {
    const mockStops = [
      { stop_id: '1', stop_name: 'Stop 1', stop_lat: 12.9, stop_lon: 77.5, zone_id: null },
      { stop_id: '2', stop_name: 'Stop 2', stop_lat: 13.0, stop_lon: 77.6, zone_id: 'Z1' },
    ];

    const mockResponse = {
      stops: mockStops,
      total: 2,
      limit: 20,
      offset: 0,
    };

    mockFetchStops.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStops({ limit: 20 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify success state
    expect(result.current.stops).toEqual(mockStops);
    expect(result.current.total).toBe(2);
    expect(result.current.limit).toBe(20);
    expect(result.current.offset).toBe(0);
    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeUndefined();
  });

  it('should handle error state', async () => {
    const mockError = new Error('Network error');
    mockFetchStops.mockRejectedValue(mockError);

    const { result } = renderHook(() => useStops({ limit: 10 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.stops).toEqual([]);
    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBeTruthy();
    expect(result.current.data).toBeUndefined();
  });

  it('should support reload functionality', async () => {
    const mockResponse = {
      stops: [
        { stop_id: '1', stop_name: 'Stop 1', stop_lat: 12.9, stop_lon: 77.5, zone_id: null },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };

    mockFetchStops.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStops({ limit: 20 }));

    // Wait for initial load
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchStops).toHaveBeenCalledTimes(1);

    // Trigger reload
    result.current.reload();

    // Should call fetchStops again
    await waitFor(() => expect(mockFetchStops).toHaveBeenCalledTimes(2));
  });

  it('should handle different query params', async () => {
    const mockResponse = {
      stops: [],
      total: 0,
      limit: 50,
      offset: 10,
    };

    mockFetchStops.mockResolvedValue(mockResponse);

    const params = {
      bbox: '12.9,77.5,13.1,77.7',
      route_id: '335E',
      limit: 50,
      offset: 10,
    };

    renderHook(() => useStops(params));

    await waitFor(() => expect(mockFetchStops).toHaveBeenCalled());

    // Verify params were passed correctly
    expect(mockFetchStops).toHaveBeenCalledWith(params);
  });

  it('should return empty stops array when no data', async () => {
    const mockResponse = {
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
    };

    mockFetchStops.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useStops());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stops).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});

/**
 * Tests for useRoutes hook
 *
 * Expected behavior:
 * - Calls fetchRoutes with provided params on mount
 * - Returns { routes, total, limit, offset, data, loading, error, reload, isRefreshing }
 * - Handles success state (data populated, loading false, error undefined)
 * - Handles loading state (loading true, data undefined)
 * - Handles error state (error populated, data undefined, loading false)
 * - Supports reload() function to refetch data
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useRoutes } from '../useRoutes';
import * as apiClient from '@/src/api/client';

// Mock the API client
jest.mock('@/src/api/client');

const mockFetchRoutes = apiClient.fetchRoutes as jest.MockedFunction<typeof apiClient.fetchRoutes>;

describe('useRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call fetchRoutes with params on mount', async () => {
    const mockResponse = {
      routes: [
        {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Kengeri to Electronic City',
          route_type: 3,
          agency_id: 'BMTC',
        },
      ],
      total: 1,
      limit: 1000,
      offset: 0,
    };

    mockFetchRoutes.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRoutes({ limit: 1000 }));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.routes).toEqual([]);

    // Wait for API call to complete
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify fetchRoutes was called
    expect(mockFetchRoutes).toHaveBeenCalledTimes(1);
    expect(mockFetchRoutes).toHaveBeenCalledWith({ limit: 1000 });
  });

  it('should return routes data on success', async () => {
    const mockRoutes = [
      {
        route_id: '335E',
        route_short_name: '335E',
        route_long_name: 'Kengeri to Electronic City',
        route_type: 3,
        agency_id: 'BMTC',
      },
      {
        route_id: '340',
        route_short_name: '340',
        route_long_name: 'Jayanagar to Whitefield',
        route_type: 3,
        agency_id: 'BMTC',
      },
    ];

    const mockResponse = {
      routes: mockRoutes,
      total: 2,
      limit: 1000,
      offset: 0,
    };

    mockFetchRoutes.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRoutes({ limit: 1000 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify success state
    expect(result.current.routes).toEqual(mockRoutes);
    expect(result.current.total).toBe(2);
    expect(result.current.limit).toBe(1000);
    expect(result.current.offset).toBe(0);
    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeUndefined();
  });

  it('should handle error state', async () => {
    const mockError = new Error('API error');
    mockFetchRoutes.mockRejectedValue(mockError);

    const { result } = renderHook(() => useRoutes({ limit: 10 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.routes).toEqual([]);
    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBeTruthy();
    expect(result.current.data).toBeUndefined();
  });

  it('should support reload functionality', async () => {
    const mockResponse = {
      routes: [
        {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Kengeri to Electronic City',
          route_type: 3,
          agency_id: 'BMTC',
        },
      ],
      total: 1,
      limit: 1000,
      offset: 0,
    };

    mockFetchRoutes.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRoutes({ limit: 1000 }));

    // Wait for initial load
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchRoutes).toHaveBeenCalledTimes(1);

    // Trigger reload
    result.current.reload();

    // Should call fetchRoutes again
    await waitFor(() => expect(mockFetchRoutes).toHaveBeenCalledTimes(2));
  });

  it('should handle filtering by stop_id', async () => {
    const mockResponse = {
      routes: [
        {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Kengeri to Electronic City',
          route_type: 3,
          agency_id: 'BMTC',
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    };

    mockFetchRoutes.mockResolvedValue(mockResponse);

    const params = {
      stop_id: '20558',
      limit: 100,
    };

    renderHook(() => useRoutes(params));

    await waitFor(() => expect(mockFetchRoutes).toHaveBeenCalled());

    // Verify params were passed correctly
    expect(mockFetchRoutes).toHaveBeenCalledWith(params);
  });

  it('should handle filtering by route_type', async () => {
    const mockResponse = {
      routes: [],
      total: 0,
      limit: 1000,
      offset: 0,
    };

    mockFetchRoutes.mockResolvedValue(mockResponse);

    const params = {
      route_type: 3, // Bus
      limit: 1000,
    };

    renderHook(() => useRoutes(params));

    await waitFor(() => expect(mockFetchRoutes).toHaveBeenCalled());

    // Verify params were passed correctly
    expect(mockFetchRoutes).toHaveBeenCalledWith(params);
  });

  it('should return empty routes array when no data', async () => {
    const mockResponse = {
      routes: [],
      total: 0,
      limit: 1000,
      offset: 0,
    };

    mockFetchRoutes.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRoutes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.routes).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});

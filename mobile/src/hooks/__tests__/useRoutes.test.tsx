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
 * - Uses fetchRoutesSearch when searchQuery is non-empty
 * - Uses fetchRoutes when searchQuery is empty or whitespace
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useRoutes } from '../useRoutes';
import * as apiClient from '@/src/api/client';

// Mock the API client
jest.mock('@/src/api/client');

const mockFetchRoutes = apiClient.fetchRoutes as jest.MockedFunction<typeof apiClient.fetchRoutes>;
const mockFetchRoutesSearch = apiClient.fetchRoutesSearch as jest.MockedFunction<typeof apiClient.fetchRoutesSearch>;

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

  describe('Server-side Search Functionality', () => {
    /**
     * Test Suite: Server-side route search
     *
     * Scenarios covered:
     * 1. Empty search query uses fetchRoutes endpoint
     * 2. Whitespace-only search query uses fetchRoutes endpoint
     * 3. Non-empty search query uses fetchRoutesSearch endpoint
     * 4. Search query is passed correctly to fetchRoutesSearch
     * 5. Search normalizes query (e.g., "335e" passed as-is, backend handles normalization)
     * 6. Search respects limit and offset parameters
     * 7. Search handles success state correctly
     * 8. Search handles error state correctly
     * 9. Switching from search to empty query switches endpoints
     * 10. Switching from empty to search query switches endpoints
     */

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should use fetchRoutes when searchQuery is undefined', async () => {
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

      const { result } = renderHook(() => useRoutes({ limit: 1000 }, undefined));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should call fetchRoutes, not fetchRoutesSearch
      expect(mockFetchRoutes).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutes).toHaveBeenCalledWith({ limit: 1000 });
      expect(mockFetchRoutesSearch).not.toHaveBeenCalled();

      expect(result.current.routes).toEqual(mockResponse.routes);
    });

    it('should use fetchRoutes when searchQuery is empty string', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
      };

      mockFetchRoutes.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRoutes({ limit: 1000 }, ''));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should call fetchRoutes, not fetchRoutesSearch
      expect(mockFetchRoutes).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutes).toHaveBeenCalledWith({ limit: 1000 });
      expect(mockFetchRoutesSearch).not.toHaveBeenCalled();
    });

    it('should use fetchRoutes when searchQuery is only whitespace', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
      };

      mockFetchRoutes.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRoutes({ limit: 1000 }, '   '));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should call fetchRoutes, not fetchRoutesSearch (whitespace is trimmed to empty)
      expect(mockFetchRoutes).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutes).toHaveBeenCalledWith({ limit: 1000 });
      expect(mockFetchRoutesSearch).not.toHaveBeenCalled();
    });

    it('should use fetchRoutesSearch when searchQuery is non-empty', async () => {
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
        limit: 50,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRoutes({ limit: 1000 }, '335e'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should call fetchRoutesSearch, not fetchRoutes
      expect(mockFetchRoutesSearch).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: '335e',
        limit: 1000,
        offset: 0,
      });
      expect(mockFetchRoutes).not.toHaveBeenCalled();

      expect(result.current.routes).toEqual(mockResponse.routes);
    });

    it('should pass trimmed searchQuery to fetchRoutesSearch', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 50,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      renderHook(() => useRoutes({ limit: 100 }, '  335e  '));

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      // Should trim whitespace before passing to API
      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: '335e',
        limit: 100,
        offset: 0,
      });
    });

    it('should preserve query case when calling fetchRoutesSearch (backend handles normalization)', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 50,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      // Test lowercase query
      renderHook(() => useRoutes({ limit: 100 }, '335e'));

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      // Query should be passed as-is (lowercase)
      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: '335e',
        limit: 100,
        offset: 0,
      });
    });

    it('should respect limit parameter when using search', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 20,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      renderHook(() => useRoutes({ limit: 20 }, 'test'));

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: 'test',
        limit: 20,
        offset: 0,
      });
    });

    it('should respect offset parameter when using search', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 50,
        offset: 100,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      renderHook(() => useRoutes({ limit: 50, offset: 100 }, 'test'));

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: 'test',
        limit: 50,
        offset: 100,
      });
    });

    it('should handle success state correctly when using search', async () => {
      const mockRoutes = [
        {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Kengeri to Electronic City',
          route_type: 3,
          agency_id: 'BMTC',
        },
        {
          route_id: '335',
          route_short_name: '335',
          route_long_name: 'Kengeri to Silk Board',
          route_type: 3,
          agency_id: 'BMTC',
        },
      ];

      const mockResponse = {
        routes: mockRoutes,
        total: 2,
        limit: 50,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRoutes({ limit: 50 }, '335'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Verify success state
      expect(result.current.routes).toEqual(mockRoutes);
      expect(result.current.total).toBe(2);
      expect(result.current.limit).toBe(50);
      expect(result.current.offset).toBe(0);
      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.error).toBeUndefined();
    });

    it('should handle error state correctly when using search', async () => {
      const mockError = new Error('Search API error');
      mockFetchRoutesSearch.mockRejectedValue(mockError);

      const { result } = renderHook(() => useRoutes({ limit: 50 }, 'test'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Verify error state
      expect(result.current.routes).toEqual([]);
      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBeTruthy();
      expect(result.current.data).toBeUndefined();
    });

    it('should switch from fetchRoutes to fetchRoutesSearch when search query is added', async () => {
      const mockFetchRoutesResponse = {
        routes: [
          {
            route_id: '335E',
            route_short_name: '335E',
            route_long_name: 'Kengeri to Electronic City',
            route_type: 3,
            agency_id: 'BMTC',
          },
        ],
        total: 1000,
        limit: 1000,
        offset: 0,
      };

      const mockSearchResponse = {
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
        limit: 50,
        offset: 0,
      };

      mockFetchRoutes.mockResolvedValue(mockFetchRoutesResponse);
      mockFetchRoutesSearch.mockResolvedValue(mockSearchResponse);

      // Start with no search query
      const { result, rerender } = renderHook(
        ({ searchQuery }) => useRoutes({ limit: 1000 }, searchQuery),
        { initialProps: { searchQuery: '' } }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should have called fetchRoutes
      expect(mockFetchRoutes).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutesSearch).not.toHaveBeenCalled();

      // Add search query
      rerender({ searchQuery: '335e' });

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      // Should now call fetchRoutesSearch
      expect(mockFetchRoutesSearch).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: '335e',
        limit: 1000,
        offset: 0,
      });
    });

    it('should switch from fetchRoutesSearch to fetchRoutes when search query is cleared', async () => {
      const mockSearchResponse = {
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
        limit: 50,
        offset: 0,
      };

      const mockFetchRoutesResponse = {
        routes: [],
        total: 1000,
        limit: 1000,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockSearchResponse);
      mockFetchRoutes.mockResolvedValue(mockFetchRoutesResponse);

      // Start with search query
      const { result, rerender } = renderHook(
        ({ searchQuery }) => useRoutes({ limit: 1000 }, searchQuery),
        { initialProps: { searchQuery: '335e' } }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should have called fetchRoutesSearch
      expect(mockFetchRoutesSearch).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutes).not.toHaveBeenCalled();

      // Clear search query
      rerender({ searchQuery: '' });

      await waitFor(() => expect(mockFetchRoutes).toHaveBeenCalled());

      // Should now call fetchRoutes
      expect(mockFetchRoutes).toHaveBeenCalledTimes(1);
      expect(mockFetchRoutes).toHaveBeenCalledWith({ limit: 1000 });
    });

    it('should not include stop_id or route_type params when using search', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 50,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      // Note: stop_id and route_type are passed in params, but should not be used with search endpoint
      renderHook(() => useRoutes({ stop_id: '20558', route_type: 3, limit: 100 }, 'test'));

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      // Search endpoint should only receive q, limit, and offset (not stop_id or route_type)
      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: 'test',
        limit: 100,
        offset: 0,
      });
    });

    it('should use default limit of 50 for search when no limit provided', async () => {
      const mockResponse = {
        routes: [],
        total: 0,
        limit: 50,
        offset: 0,
      };

      mockFetchRoutesSearch.mockResolvedValue(mockResponse);

      renderHook(() => useRoutes({}, 'test'));

      await waitFor(() => expect(mockFetchRoutesSearch).toHaveBeenCalled());

      // Should use default limit of 50 for search
      expect(mockFetchRoutesSearch).toHaveBeenCalledWith({
        q: 'test',
        limit: 50,
        offset: 0,
      });
    });
  });
});

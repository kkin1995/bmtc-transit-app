/**
 * Hook for fetching GTFS routes with filtering, pagination, and server-side search
 *
 * Wraps the fetchRoutes and fetchRoutesSearch API client functions with loading states and error handling.
 * Uses server-side search when searchQuery is non-empty, otherwise uses regular fetchRoutes.
 */

import { useCallback, useMemo } from 'react';
import { fetchRoutes, fetchRoutesSearch } from '@/src/api/client';
import type { RoutesListResponse, FetchRoutesParams } from '@/src/api/types';
import { useAsyncData, type AsyncDataResult } from './useAsyncData';

/**
 * Return type for useRoutes hook
 */
export interface UseRoutesResult extends Omit<AsyncDataResult<RoutesListResponse>, 'data'> {
  /** List of routes */
  routes: RoutesListResponse['routes'];
  /** Total count of routes matching query (before pagination) */
  total: number;
  /** Applied limit */
  limit: number;
  /** Applied offset */
  offset: number;
  /** Full response data (for advanced use cases) */
  data: RoutesListResponse | undefined;
}

/**
 * Hook for fetching GTFS routes with server-side search support
 *
 * @param params - Query parameters (stop_id, route_type, limit, offset)
 * @param searchQuery - Optional search query (uses server-side search if non-empty after trimming)
 * @returns Routes data with loading and error states
 *
 * @example
 * ```typescript
 * // Get first 50 routes (no search)
 * const { routes, loading, error, reload } = useRoutes({ limit: 50 });
 *
 * // Server-side search for route "335e" (finds "335-E")
 * const { routes } = useRoutes({ limit: 50 }, '335e');
 *
 * // Get routes serving a specific stop
 * const { routes, total } = useRoutes({ stop_id: '20558' });
 *
 * // Filter by route type (3 = bus)
 * const { routes } = useRoutes({ route_type: 3, limit: 100 });
 * ```
 */
export function useRoutes(params?: FetchRoutesParams, searchQuery?: string): UseRoutesResult {
  // Trim and check if search query is non-empty
  const trimmedQuery = useMemo(() => searchQuery?.trim() || '', [searchQuery]);
  const hasSearchQuery = trimmedQuery.length > 0;

  // Memoize params to avoid unnecessary refetches
  const stableParams = useMemo(() => params, [
    params?.stop_id,
    params?.route_type,
    params?.limit,
    params?.offset,
  ]);

  // Create fetcher function - use search endpoint when query is non-empty
  const fetcher = useCallback(() => {
    if (hasSearchQuery) {
      // Server-side search with normalized matching
      return fetchRoutesSearch({
        q: trimmedQuery,
        limit: stableParams?.limit || 50, // Default to 50 for search
        offset: stableParams?.offset || 0,
      });
    } else {
      // Regular routes endpoint
      return fetchRoutes(stableParams);
    }
  }, [hasSearchQuery, trimmedQuery, stableParams]);

  // Use generic async hook
  const { data, loading, error, reload, isRefreshing } = useAsyncData<RoutesListResponse>(
    fetcher,
    [hasSearchQuery, trimmedQuery, stableParams]
  );

  // Extract and provide convenient access to response fields
  return {
    routes: data?.routes || [],
    total: data?.total || 0,
    limit: data?.limit || params?.limit || 100,
    offset: data?.offset || params?.offset || 0,
    data,
    loading,
    error,
    reload,
    isRefreshing,
  };
}

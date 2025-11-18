/**
 * Hook for fetching GTFS routes with filtering and pagination
 *
 * Wraps the fetchRoutes API client function with loading states and error handling.
 */

import { useCallback, useMemo } from 'react';
import { fetchRoutes } from '@/src/api/client';
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
 * Hook for fetching GTFS routes
 *
 * @param params - Query parameters (stop_id, route_type, limit, offset)
 * @returns Routes data with loading and error states
 *
 * @example
 * ```typescript
 * // Get first 50 routes
 * const { routes, loading, error, reload } = useRoutes({ limit: 50 });
 *
 * // Get routes serving a specific stop
 * const { routes, total } = useRoutes({ stop_id: '20558' });
 *
 * // Filter by route type (3 = bus)
 * const { routes } = useRoutes({ route_type: 3, limit: 100 });
 * ```
 */
export function useRoutes(params?: FetchRoutesParams): UseRoutesResult {
  // Memoize params to avoid unnecessary refetches
  const stableParams = useMemo(() => params, [
    params?.stop_id,
    params?.route_type,
    params?.limit,
    params?.offset,
  ]);

  // Create fetcher function
  const fetcher = useCallback(() => {
    return fetchRoutes(stableParams);
  }, [stableParams]);

  // Use generic async hook
  const { data, loading, error, reload, isRefreshing } = useAsyncData<RoutesListResponse>(
    fetcher,
    [stableParams]
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

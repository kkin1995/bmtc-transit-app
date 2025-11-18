/**
 * Hook for fetching GTFS stops with filtering and pagination
 *
 * Wraps the fetchStops API client function with loading states and error handling.
 */

import { useCallback, useMemo } from 'react';
import { fetchStops } from '@/src/api/client';
import type { StopsListResponse, FetchStopsParams } from '@/src/api/types';
import { useAsyncData, type AsyncDataResult } from './useAsyncData';

/**
 * Return type for useStops hook
 */
export interface UseStopsResult extends Omit<AsyncDataResult<StopsListResponse>, 'data'> {
  /** List of stops */
  stops: StopsListResponse['stops'];
  /** Total count of stops matching query (before pagination) */
  total: number;
  /** Applied limit */
  limit: number;
  /** Applied offset */
  offset: number;
  /** Full response data (for advanced use cases) */
  data: StopsListResponse | undefined;
}

/**
 * Hook for fetching GTFS stops
 *
 * @param params - Query parameters (bbox, route_id, limit, offset)
 * @returns Stops data with loading and error states
 *
 * @example
 * ```typescript
 * // Get first 20 stops
 * const { stops, loading, error, reload } = useStops({ limit: 20 });
 *
 * // Get stops within bounding box
 * const { stops, total } = useStops({
 *   bbox: '12.9,77.5,13.1,77.7',
 *   limit: 50
 * });
 *
 * // Get stops served by route
 * const { stops } = useStops({ route_id: '335E' });
 * ```
 */
export function useStops(params?: FetchStopsParams): UseStopsResult {
  // Memoize params to avoid unnecessary refetches
  const stableParams = useMemo(() => params, [
    params?.bbox,
    params?.route_id,
    params?.limit,
    params?.offset,
  ]);

  // Create fetcher function
  const fetcher = useCallback(() => {
    return fetchStops(stableParams);
  }, [stableParams]);

  // Use generic async hook
  const { data, loading, error, reload, isRefreshing } = useAsyncData<StopsListResponse>(
    fetcher,
    [stableParams]
  );

  // Extract and provide convenient access to response fields
  return {
    stops: data?.stops || [],
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

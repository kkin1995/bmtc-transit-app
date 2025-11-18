/**
 * Hook for fetching ETA predictions
 *
 * Wraps the fetchEta API client function with loading states and error handling.
 * Only fetches when all required parameters are provided.
 */

import { useCallback, useMemo } from 'react';
import { fetchEta } from '@/src/api/client';
import type { ETAResponseV11, FetchEtaParams } from '@/src/api/types';
import { useAsyncData, type AsyncDataResult } from './useAsyncData';

/**
 * Return type for useEta hook
 */
export interface UseEtaResult extends Omit<AsyncDataResult<ETAResponseV11>, 'data'> {
  /** Segment information */
  segment: ETAResponseV11['segment'] | undefined;
  /** Query time in ISO-8601 UTC format */
  queryTime: string | undefined;
  /** GTFS scheduled duration */
  scheduled: ETAResponseV11['scheduled'] | undefined;
  /** ML prediction data */
  prediction: ETAResponseV11['prediction'] | undefined;
  /** Full response data (for advanced use cases) */
  data: ETAResponseV11 | undefined;
  /** True if required params are missing (won't fetch) */
  missingParams: boolean;
}

/**
 * Check if all required ETA params are present
 */
function hasRequiredParams(params?: FetchEtaParams): boolean {
  if (!params) return false;

  return !!(
    params.route_id &&
    params.direction_id !== undefined &&
    params.direction_id !== null &&
    params.from_stop_id &&
    params.to_stop_id
  );
}

/**
 * Hook for fetching ETA predictions
 *
 * @param params - Query parameters (route_id, direction_id, from_stop_id, to_stop_id, when)
 * @returns ETA data with loading and error states
 *
 * @example
 * ```typescript
 * // Get ETA for current time
 * const { segment, scheduled, prediction, loading } = useEta({
 *   route_id: '335E',
 *   direction_id: 0,
 *   from_stop_id: '20558',
 *   to_stop_id: '29374'
 * });
 *
 * // Get ETA at specific time
 * const { prediction } = useEta({
 *   route_id: '335E',
 *   direction_id: 0,
 *   from_stop_id: '20558',
 *   to_stop_id: '29374',
 *   when: '2025-11-18T14:30:00Z'
 * });
 *
 * // Conditional fetching (missing params)
 * const { missingParams, loading } = useEta({
 *   route_id: '335E',
 *   // missing other params
 * });
 * // missingParams === true, loading === false (won't fetch)
 * ```
 */
export function useEta(params?: FetchEtaParams): UseEtaResult {
  // Check if we have all required params
  const missingParams = !hasRequiredParams(params);

  // Memoize params to avoid unnecessary refetches
  const stableParams = useMemo(() => params, [
    params?.route_id,
    params?.direction_id,
    params?.from_stop_id,
    params?.to_stop_id,
    params?.when,
  ]);

  // Create fetcher function (only if all required params are present)
  const fetcher = useCallback(() => {
    if (!stableParams || missingParams) {
      // Return a rejected promise to prevent fetch
      return Promise.reject(
        new Error('Missing required parameters: route_id, direction_id, from_stop_id, to_stop_id')
      );
    }
    return fetchEta(stableParams);
  }, [stableParams, missingParams]);

  // Use generic async hook
  const { data, loading, error, reload, isRefreshing } = useAsyncData<ETAResponseV11>(
    fetcher,
    [stableParams]
  );

  // If params are missing, override loading and error states
  const effectiveLoading = missingParams ? false : loading;
  const effectiveError = missingParams ? undefined : error;

  // Extract and provide convenient access to response fields
  return {
    segment: data?.segment,
    queryTime: data?.query_time,
    scheduled: data?.scheduled,
    prediction: data?.prediction,
    data,
    loading: effectiveLoading,
    error: effectiveError,
    reload,
    isRefreshing,
    missingParams,
  };
}

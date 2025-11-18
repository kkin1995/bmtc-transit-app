/**
 * Hook for fetching scheduled departures for a stop
 *
 * Wraps the fetchStopSchedule API client function with loading states and error handling.
 * Supports optional auto-refresh for real-time departure updates.
 */

import { useCallback, useMemo } from 'react';
import { fetchStopSchedule } from '@/src/api/client';
import type { ScheduleResponse, FetchScheduleParams } from '@/src/api/types';
import { useAsyncData, type AsyncDataResult } from './useAsyncData';

/**
 * Return type for useStopSchedule hook
 */
export interface UseStopScheduleResult extends Omit<AsyncDataResult<ScheduleResponse>, 'data'> {
  /** Stop information */
  stop: ScheduleResponse['stop'] | undefined;
  /** List of upcoming departures */
  departures: ScheduleResponse['departures'];
  /** Query time in ISO-8601 UTC format */
  queryTime: string | undefined;
  /** Full response data (for advanced use cases) */
  data: ScheduleResponse | undefined;
}

/**
 * Hook for fetching stop schedule (departures)
 *
 * @param stopId - GTFS stop identifier (required)
 * @param params - Query parameters (when, time_window_minutes, route_id)
 * @returns Schedule data with loading and error states
 *
 * @example
 * ```typescript
 * // Get next hour of departures (default)
 * const { stop, departures, loading, error } = useStopSchedule('20558');
 *
 * // Get departures with 2-hour window
 * const { departures } = useStopSchedule('20558', {
 *   time_window_minutes: 120
 * });
 *
 * // Filter by route
 * const { departures } = useStopSchedule('20558', {
 *   route_id: '335E'
 * });
 *
 * // Manual refresh
 * const { reload } = useStopSchedule('20558');
 * // ... later:
 * reload();
 * ```
 */
export function useStopSchedule(
  stopId: string | undefined | null,
  params?: FetchScheduleParams
): UseStopScheduleResult {
  // Memoize params to avoid unnecessary refetches
  const stableParams = useMemo(() => params, [
    params?.when,
    params?.time_window_minutes,
    params?.route_id,
  ]);

  // Create fetcher function (only if stopId is valid)
  const fetcher = useCallback(() => {
    if (!stopId) {
      // Return a rejected promise to prevent fetch
      return Promise.reject(new Error('Stop ID is required'));
    }
    return fetchStopSchedule(stopId, stableParams);
  }, [stopId, stableParams]);

  // Use generic async hook
  // Note: If stopId is falsy, the fetcher will reject, and we'll get an error state
  const { data, loading, error, reload, isRefreshing } = useAsyncData<ScheduleResponse>(
    fetcher,
    [stopId, stableParams]
  );

  // If stopId is missing, override the error with a more user-friendly state
  const effectiveLoading = stopId ? loading : false;
  const effectiveError = !stopId
    ? undefined // Don't show error if stopId is just missing
    : error;

  // Extract and provide convenient access to response fields
  return {
    stop: data?.stop,
    departures: data?.departures || [],
    queryTime: data?.query_time,
    data,
    loading: effectiveLoading,
    error: effectiveError,
    reload,
    isRefreshing,
  };
}

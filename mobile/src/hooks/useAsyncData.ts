/**
 * Generic async data fetching hook
 *
 * Provides a unified interface for async operations with loading states,
 * error handling, and manual refresh capability.
 *
 * @template T - Type of data returned by async function
 */

import { useState, useEffect, useCallback } from 'react';
import { isBMTCApiError, isNetworkError, isTimeoutError } from '@/src/api/errors';

/**
 * Normalized error type for consistent error handling
 */
export interface ErrorLike {
  /** Human-readable error message */
  message: string;
  /** Machine-readable error code (optional) */
  code?: string;
  /** Additional error details (optional) */
  details?: any;
}

/**
 * Return type for useAsyncData hook
 */
export interface AsyncDataResult<T> {
  /** Fetched data (undefined while loading or on error) */
  data: T | undefined;
  /** Loading state (true during initial load and reload) */
  loading: boolean;
  /** Normalized error (undefined when no error) */
  error: ErrorLike | undefined;
  /** Manual refresh function */
  reload: () => void;
  /** True when reloading (not initial load) */
  isRefreshing: boolean;
}

/**
 * Normalize any error into ErrorLike format
 */
function normalizeError(error: unknown): ErrorLike {
  // Handle BMTCApiError
  if (isBMTCApiError(error)) {
    return {
      message: error.getUserMessage(),
      code: error.errorCode,
      details: error.details,
    };
  }

  // Handle NetworkError
  if (isNetworkError(error)) {
    return {
      message: error.getUserMessage(),
      code: 'network_error',
    };
  }

  // Handle TimeoutError
  if (isTimeoutError(error)) {
    return {
      message: error.getUserMessage(),
      code: 'timeout',
    };
  }

  // Handle generic Error
  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'unknown_error',
    };
  }

  // Fallback for unknown error types
  return {
    message: 'An unexpected error occurred',
    code: 'unknown_error',
  };
}

/**
 * Generic async data fetching hook
 *
 * @param asyncFn - Async function to fetch data
 * @param deps - Dependency array (triggers refetch when changed)
 * @returns Object with data, loading, error, reload, and isRefreshing
 *
 * @example
 * ```typescript
 * const { data, loading, error, reload } = useAsyncData(
 *   async () => fetchStops({ limit: 10 }),
 *   []
 * );
 * ```
 */
export function useAsyncData<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = []
): AsyncDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ErrorLike | undefined>(undefined);
  const [refreshCounter, setRefreshCounter] = useState<number>(0);

  // Track if this is a refresh (not initial load)
  const isRefreshing = loading && data !== undefined;

  // Memoized fetch function
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);

      const result = await asyncFn();
      setData(result);
    } catch (err) {
      const normalizedError = normalizeError(err);
      setError(normalizedError);
      console.error('useAsyncData error:', normalizedError);
    } finally {
      setLoading(false);
    }
  }, [asyncFn]);

  // Manual reload function
  const reload = useCallback(() => {
    setRefreshCounter((prev) => prev + 1);
  }, []);

  // Fetch data on mount and when deps/refreshCounter change
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshCounter]);

  return {
    data,
    loading,
    error,
    reload,
    isRefreshing,
  };
}

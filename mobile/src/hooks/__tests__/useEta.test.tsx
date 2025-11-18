/**
 * Tests for useEta hook
 *
 * Expected behavior:
 * - Does NOT call fetchEta until all required params are present:
 *   route_id, direction_id, from_stop_id, to_stop_id
 * - Returns missingParams=true when params are incomplete
 * - Calls fetchEta with correct params when all required params provided
 * - Returns { segment, queryTime, scheduled, prediction, data, loading, error, reload, isRefreshing, missingParams }
 * - Handles success state with ETA data
 * - Handles error state
 * - Supports reload() function
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useEta } from '../useEta';
import * as apiClient from '@/src/api/client';

// Mock the API client
jest.mock('@/src/api/client');

const mockFetchEta = apiClient.fetchEta as jest.MockedFunction<typeof apiClient.fetchEta>;

describe('useEta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should NOT call fetchEta when params are missing', async () => {
    const { result } = renderHook(() => useEta(undefined));

    // Should indicate missing params
    expect(result.current.missingParams).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();

    // Wait a bit to ensure no API call is made
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify fetchEta was NOT called
    expect(mockFetchEta).not.toHaveBeenCalled();
  });

  it('should NOT call fetchEta when route_id is missing', async () => {
    const { result } = renderHook(() =>
      useEta({
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      } as any)
    );

    expect(result.current.missingParams).toBe(true);
    expect(result.current.loading).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFetchEta).not.toHaveBeenCalled();
  });

  it('should NOT call fetchEta when direction_id is missing', async () => {
    const { result } = renderHook(() =>
      useEta({
        route_id: '335E',
        from_stop_id: '20558',
        to_stop_id: '29374',
      } as any)
    );

    expect(result.current.missingParams).toBe(true);
    expect(result.current.loading).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFetchEta).not.toHaveBeenCalled();
  });

  it('should NOT call fetchEta when from_stop_id is missing', async () => {
    const { result } = renderHook(() =>
      useEta({
        route_id: '335E',
        direction_id: 0,
        to_stop_id: '29374',
      } as any)
    );

    expect(result.current.missingParams).toBe(true);
    expect(result.current.loading).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFetchEta).not.toHaveBeenCalled();
  });

  it('should NOT call fetchEta when to_stop_id is missing', async () => {
    const { result } = renderHook(() =>
      useEta({
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
      } as any)
    );

    expect(result.current.missingParams).toBe(true);
    expect(result.current.loading).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFetchEta).not.toHaveBeenCalled();
  });

  it('should call fetchEta when all required params are provided', async () => {
    const mockResponse = {
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      query_time: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 1800,
        service_id: 'WEEKDAY',
        source: 'gtfs' as const,
      },
      prediction: {
        predicted_duration_sec: 1650,
        p50_sec: 1600,
        p90_sec: 2000,
        confidence: 'high' as const,
        blend_weight: 0.75,
        samples_used: 150,
        bin_id: 56,
        last_updated: '2025-11-18T13:55:00Z',
        model_version: 'v1.0',
      },
    };

    mockFetchEta.mockResolvedValue(mockResponse);

    const params = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
    };

    const { result } = renderHook(() => useEta(params));

    // Should indicate params are complete
    expect(result.current.missingParams).toBe(false);

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for API call to complete
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify fetchEta was called with correct params
    expect(mockFetchEta).toHaveBeenCalledTimes(1);
    expect(mockFetchEta).toHaveBeenCalledWith(params);
  });

  it('should return ETA data on success', async () => {
    const mockSegment = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
    };

    const mockScheduled = {
      duration_sec: 1800,
      service_id: 'WEEKDAY',
      source: 'gtfs' as const,
    };

    const mockPrediction = {
      predicted_duration_sec: 1650,
      p50_sec: 1600,
      p90_sec: 2000,
      confidence: 'high' as const,
      blend_weight: 0.75,
      samples_used: 150,
      bin_id: 56,
      last_updated: '2025-11-18T13:55:00Z',
      model_version: 'v1.0',
    };

    const mockResponse = {
      segment: mockSegment,
      query_time: '2025-11-18T14:00:00Z',
      scheduled: mockScheduled,
      prediction: mockPrediction,
    };

    mockFetchEta.mockResolvedValue(mockResponse);

    const params = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
    };

    const { result } = renderHook(() => useEta(params));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify success state
    expect(result.current.segment).toEqual(mockSegment);
    expect(result.current.scheduled).toEqual(mockScheduled);
    expect(result.current.prediction).toEqual(mockPrediction);
    expect(result.current.queryTime).toBe('2025-11-18T14:00:00Z');
    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeUndefined();
    expect(result.current.missingParams).toBe(false);
  });

  it('should handle error state', async () => {
    const mockError = new Error('Segment not found');
    mockFetchEta.mockRejectedValue(mockError);

    const params = {
      route_id: 'INVALID',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
    };

    const { result } = renderHook(() => useEta(params));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBeTruthy();
    expect(result.current.data).toBeUndefined();
    expect(result.current.missingParams).toBe(false);
  });

  it('should support reload functionality', async () => {
    const mockResponse = {
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      query_time: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 1800,
        service_id: 'WEEKDAY',
        source: 'gtfs' as const,
      },
      prediction: {
        predicted_duration_sec: 1650,
        p50_sec: 1600,
        p90_sec: 2000,
        confidence: 'high' as const,
        blend_weight: 0.75,
        samples_used: 150,
        bin_id: 56,
        last_updated: '2025-11-18T13:55:00Z',
        model_version: 'v1.0',
      },
    };

    mockFetchEta.mockResolvedValue(mockResponse);

    const params = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
    };

    const { result } = renderHook(() => useEta(params));

    // Wait for initial load
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEta).toHaveBeenCalledTimes(1);

    // Trigger reload
    result.current.reload();

    // Should call fetchEta again
    await waitFor(() => expect(mockFetchEta).toHaveBeenCalledTimes(2));
  });

  it('should handle optional when parameter', async () => {
    const mockResponse = {
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      query_time: '2025-11-18T15:00:00Z',
      scheduled: {
        duration_sec: 1800,
        service_id: 'WEEKDAY',
        source: 'gtfs' as const,
      },
      prediction: {
        predicted_duration_sec: 1650,
        p50_sec: 1600,
        p90_sec: 2000,
        confidence: 'medium' as const,
        blend_weight: 0.65,
        samples_used: 80,
        bin_id: 60,
        last_updated: '2025-11-18T14:55:00Z',
        model_version: 'v1.0',
      },
    };

    mockFetchEta.mockResolvedValue(mockResponse);

    const params = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
      when: '2025-11-18T15:00:00Z',
    };

    renderHook(() => useEta(params));

    await waitFor(() => expect(mockFetchEta).toHaveBeenCalled());

    // Verify params including when were passed correctly
    expect(mockFetchEta).toHaveBeenCalledWith(params);
  });

  it('should handle direction_id of 0 (not falsy check)', async () => {
    const mockResponse = {
      segment: {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
      },
      query_time: '2025-11-18T14:00:00Z',
      scheduled: {
        duration_sec: 1800,
        source: 'gtfs' as const,
      },
      prediction: {
        predicted_duration_sec: 1650,
        p50_sec: 1600,
        p90_sec: 2000,
        confidence: 'high' as const,
        blend_weight: 0.75,
        samples_used: 150,
        bin_id: 56,
        last_updated: '2025-11-18T13:55:00Z',
        model_version: 'v1.0',
      },
    };

    mockFetchEta.mockResolvedValue(mockResponse);

    const params = {
      route_id: '335E',
      direction_id: 0, // Should be treated as valid (not falsy)
      from_stop_id: '20558',
      to_stop_id: '29374',
    };

    const { result } = renderHook(() => useEta(params));

    // direction_id=0 should be valid
    expect(result.current.missingParams).toBe(false);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchEta).toHaveBeenCalledWith(params);
  });
});

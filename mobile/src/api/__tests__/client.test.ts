/**
 * Tests for API client functions
 *
 * Tests the core API client functions, focusing on POST /v1/ride_summary.
 * Uses Jest to mock the global fetch function.
 */

import {
  postRideSummary,
  PostRideSummaryRequest,
  PostRideSummaryResponse,
} from '../client';
import { BMTCApiError, NetworkError, TimeoutError } from '../errors';

// Mock the global fetch function
global.fetch = jest.fn();

// Helper to create a mock fetch response
function createMockResponse(status: number, body: any): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    headers: new Headers({
      'X-RateLimit-Limit': '500',
      'X-RateLimit-Remaining': '499',
      'X-RateLimit-Reset': '1761136800',
      'X-API-Version': '1',
    }),
  } as Response;
}

describe('postRideSummary', () => {
  const mockApiKey = 'test-api-key-123';
  const mockIdempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  const validRequest: PostRideSummaryRequest = {
    route_id: '335E',
    direction_id: 0,
    device_bucket: '7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d',
    segments: [
      {
        from_stop_id: '20558',
        to_stop_id: '29374',
        duration_sec: 320.5,
        dwell_sec: 25.0,
        mapmatch_conf: 0.86,
        observed_at_utc: '2025-10-22T10:33:00Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful request', () => {
    it('should send POST request with correct method, path, and headers', async () => {
      const mockResponse: PostRideSummaryResponse = {
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(200, mockResponse));

      await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);

      // Verify fetch was called with correct arguments
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];

      // Verify URL contains correct path
      expect(url).toContain('/v1/ride_summary');

      // Verify method is POST
      expect(options.method).toBe('POST');

      // Verify headers
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockApiKey}`,
        'Idempotency-Key': mockIdempotencyKey,
      });

      // Verify body matches request
      expect(JSON.parse(options.body)).toEqual(validRequest);
    });

    it('should return the response data on success', async () => {
      const mockResponse: PostRideSummaryResponse = {
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(200, mockResponse));

      const result = await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);

      expect(result).toEqual(mockResponse);
    });

    it('should handle multiple segments in request', async () => {
      const requestWithMultipleSegments: PostRideSummaryRequest = {
        route_id: '335E',
        direction_id: 0,
        device_bucket: '7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d',
        segments: [
          {
            from_stop_id: '20558',
            to_stop_id: '21234',
            duration_sec: 180.0,
            dwell_sec: 15.0,
            mapmatch_conf: 0.92,
            observed_at_utc: '2025-10-22T10:30:00Z',
          },
          {
            from_stop_id: '21234',
            to_stop_id: '29374',
            duration_sec: 140.5,
            dwell_sec: 20.0,
            mapmatch_conf: 0.88,
            observed_at_utc: '2025-10-22T10:35:00Z',
          },
        ],
      };

      const mockResponse: PostRideSummaryResponse = {
        accepted_segments: 2,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(200, mockResponse));

      const result = await postRideSummary(
        requestWithMultipleSegments,
        mockApiKey,
        mockIdempotencyKey
      );

      expect(result.accepted_segments).toBe(2);

      // Verify the request body was sent correctly
      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.segments).toHaveLength(2);
    });

    it('should handle optional dwell_sec field', async () => {
      const requestWithoutDwell: PostRideSummaryRequest = {
        route_id: '335E',
        direction_id: 0,
        device_bucket: '7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d',
        segments: [
          {
            from_stop_id: '20558',
            to_stop_id: '29374',
            duration_sec: 320.5,
            mapmatch_conf: 0.86,
            observed_at_utc: '2025-10-22T10:33:00Z',
          },
        ],
      };

      const mockResponse: PostRideSummaryResponse = {
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(200, mockResponse));

      const result = await postRideSummary(
        requestWithoutDwell,
        mockApiKey,
        mockIdempotencyKey
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('error handling', () => {
    it('should throw BMTCApiError for 400 invalid_request', async () => {
      const errorResponse = {
        error: 'invalid_request',
        message: 'Invalid JSON in request body',
        details: {},
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(400, errorResponse));

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(BMTCApiError);

      try {
        await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);
      } catch (error) {
        expect(error).toBeInstanceOf(BMTCApiError);
        if (error instanceof BMTCApiError) {
          expect(error.statusCode).toBe(400);
          expect(error.errorCode).toBe('invalid_request');
          expect(error.message).toBe('Invalid JSON in request body');
        }
      }
    });

    it('should throw BMTCApiError for 401 unauthorized', async () => {
      const errorResponse = {
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header',
        details: {},
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(401, errorResponse));

      await expect(
        postRideSummary(validRequest, 'invalid-key', mockIdempotencyKey)
      ).rejects.toThrow(BMTCApiError);

      try {
        await postRideSummary(validRequest, 'invalid-key', mockIdempotencyKey);
      } catch (error) {
        if (error instanceof BMTCApiError) {
          expect(error.statusCode).toBe(401);
          expect(error.errorCode).toBe('unauthorized');
        }
      }
    });

    it('should throw BMTCApiError for 409 conflict (idempotency key reused)', async () => {
      const errorResponse = {
        error: 'conflict',
        message: 'Idempotency key reused with different request body',
        details: {
          idempotency_key: mockIdempotencyKey,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(409, errorResponse));

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(BMTCApiError);

      try {
        await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);
      } catch (error) {
        if (error instanceof BMTCApiError) {
          expect(error.statusCode).toBe(409);
          expect(error.errorCode).toBe('conflict');
          expect(error.details?.idempotency_key).toBe(mockIdempotencyKey);
        }
      }
    });

    it('should throw BMTCApiError for 422 unprocessable (stale timestamp)', async () => {
      const errorResponse = {
        error: 'unprocessable',
        message: 'observed_at_utc must be within the last 7 days',
        details: {
          field: 'segments[0].observed_at_utc',
          value: '2025-10-01T10:33:00Z',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(422, errorResponse));

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(BMTCApiError);

      try {
        await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);
      } catch (error) {
        if (error instanceof BMTCApiError) {
          expect(error.statusCode).toBe(422);
          expect(error.errorCode).toBe('unprocessable');
          expect(error.details?.field).toBe('segments[0].observed_at_utc');
        }
      }
    });

    it('should throw BMTCApiError for 429 rate_limited', async () => {
      const errorResponse = {
        error: 'rate_limited',
        message: 'Rate limit exceeded for device bucket',
        details: {
          limit: 500,
          window: '1 hour',
          retry_after_sec: 1800,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(429, errorResponse));

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(BMTCApiError);

      try {
        await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);
      } catch (error) {
        if (error instanceof BMTCApiError) {
          expect(error.statusCode).toBe(429);
          expect(error.errorCode).toBe('rate_limited');
          expect(error.details?.retry_after_sec).toBe(1800);
        }
      }
    });

    it('should throw BMTCApiError for 500 server_error', async () => {
      const errorResponse = {
        error: 'server_error',
        message: 'An unexpected error occurred',
        details: {},
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(500, errorResponse));

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(BMTCApiError);

      try {
        await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);
      } catch (error) {
        if (error instanceof BMTCApiError) {
          expect(error.statusCode).toBe(500);
          expect(error.errorCode).toBe('server_error');
        }
      }
    });

    it('should throw NetworkError when fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(NetworkError);
    });

    it('should throw TimeoutError when request times out', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      await expect(
        postRideSummary(validRequest, mockApiKey, mockIdempotencyKey)
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('idempotency', () => {
    it('should send the same Idempotency-Key header on retry', async () => {
      const mockResponse: PostRideSummaryResponse = {
        accepted_segments: 1,
        rejected_segments: 0,
        rejected_by_reason: {
          outlier: 0,
          low_confidence: 0,
          invalid_segment: 0,
          too_many_segments: 0,
          stale_timestamp: 0,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(createMockResponse(200, mockResponse));

      // First request
      await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);

      const firstCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(firstCall[1].headers['Idempotency-Key']).toBe(mockIdempotencyKey);

      // Second request with same key should send same header
      await postRideSummary(validRequest, mockApiKey, mockIdempotencyKey);

      const secondCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(secondCall[1].headers['Idempotency-Key']).toBe(mockIdempotencyKey);
    });
  });
});

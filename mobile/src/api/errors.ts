/**
 * Error handling utilities for API client
 *
 * Provides custom error classes and utilities for handling
 * standardized API errors from the BMTC Transit backend.
 */

import { APIError } from './types';

/**
 * Custom error class for API errors
 *
 * Wraps the standardized error response from the backend
 * with additional context like HTTP status code.
 */
export class BMTCApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: APIError['error'];
  public readonly details?: Record<string, any>;

  constructor(statusCode: number, apiError: APIError) {
    super(apiError.message);
    this.name = 'BMTCApiError';
    this.statusCode = statusCode;
    this.errorCode = apiError.error;
    this.details = apiError.details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BMTCApiError);
    }
  }

  /**
   * Check if this is a specific error type
   */
  public is(errorCode: APIError['error']): boolean {
    return this.errorCode === errorCode;
  }

  /**
   * Get a user-friendly error message
   */
  public getUserMessage(): string {
    // You can customize messages for better UX here
    switch (this.errorCode) {
      case 'invalid_request':
        return `Invalid request: ${this.message}`;
      case 'unauthorized':
        return 'Authentication failed. Please check your credentials.';
      case 'not_found':
        return `Not found: ${this.message}`;
      case 'conflict':
        return `Conflict: ${this.message}`;
      case 'unprocessable':
        return `Cannot process: ${this.message}`;
      case 'rate_limited':
        return 'Too many requests. Please try again later.';
      case 'server_error':
        return 'Server error. Please try again later.';
      default:
        return this.message;
    }
  }

  /**
   * Convert error to a JSON-serializable object
   */
  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
    };
  }
}

/**
 * Custom error for network failures
 */
export class NetworkError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'NetworkError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }

  public getUserMessage(): string {
    return 'Network error. Please check your connection and try again.';
  }
}

/**
 * Custom error for timeout
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }

  public getUserMessage(): string {
    return 'Request timed out. Please try again.';
  }
}

/**
 * Parse error response from fetch
 *
 * Attempts to parse the error body as JSON and create a BMTCApiError.
 * Falls back to generic errors if parsing fails.
 */
export async function parseErrorResponse(response: Response): Promise<BMTCApiError> {
  try {
    const errorData: APIError = await response.json();
    return new BMTCApiError(response.status, errorData);
  } catch (parseError) {
    // If we can't parse the error response, create a generic error
    const genericError: APIError = {
      error: 'server_error',
      message: `HTTP ${response.status}: ${response.statusText}`,
      details: {},
    };
    return new BMTCApiError(response.status, genericError);
  }
}

/**
 * Type guard to check if an error is a BMTCApiError
 */
export function isBMTCApiError(error: unknown): error is BMTCApiError {
  return error instanceof BMTCApiError;
}

/**
 * Type guard to check if an error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard to check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Get a user-friendly error message from any error type
 */
export function getUserErrorMessage(error: unknown): string {
  if (isBMTCApiError(error)) {
    return error.getUserMessage();
  }
  if (isNetworkError(error)) {
    return error.getUserMessage();
  }
  if (isTimeoutError(error)) {
    return error.getUserMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Assertion Helpers
 * Custom assertions and matchers for testing
 */

/**
 * Custom Jest matchers
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidPhoneNumber(): R;
      toBeValidCoordinate(): R;
      toBeValidTimestamp(): R;
      toHaveValidSchema(schema: any): R;
      toBeWithinRange(min: number, max: number): R;
      toBeValidHealthResponse(serviceName?: string): R;
      toBeValidLocationData(): R;
      toBeValidRouteData(): R;
    }
  }
}

/**
 * UUID validation
 */
export function toBeValidUUID(received: any): { pass: boolean; message: () => string } {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const pass = typeof received === 'string' && uuidRegex.test(received);

  return {
    pass,
    message: () => `expected ${received} to be a valid UUID`,
  };
}

/**
 * Phone number validation (Indian format)
 */
export function toBeValidPhoneNumber(received: any): { pass: boolean; message: () => string } {
  const phoneRegex = /^\+91[6-9]\d{9}$/;
  const pass = typeof received === 'string' && phoneRegex.test(received);

  return {
    pass,
    message: () => `expected ${received} to be a valid Indian phone number (+91XXXXXXXXXX)`,
  };
}

/**
 * Coordinate validation (Bangalore area)
 */
export function toBeValidCoordinate(received: any): { pass: boolean; message: () => string } {
  const { latitude, longitude } = received || {};

  const isValidLat = typeof latitude === 'number' && latitude >= 12.5 && latitude <= 13.5; // Bangalore latitude range
  const isValidLng = typeof longitude === 'number' && longitude >= 77.0 && longitude <= 78.0; // Bangalore longitude range

  const pass = isValidLat && isValidLng;

  return {
    pass,
    message: () => `expected ${JSON.stringify(received)} to have valid Bangalore coordinates`,
  };
}

/**
 * Timestamp validation
 */
export function toBeValidTimestamp(received: any): { pass: boolean; message: () => string } {
  const pass =
    typeof received === 'string' &&
    !isNaN(Date.parse(received)) &&
    new Date(received).toISOString() === received;

  return {
    pass,
    message: () => `expected ${received} to be a valid ISO timestamp`,
  };
}

/**
 * Schema validation using Joi
 */
export function toHaveValidSchema(
  received: any,
  schema: any
): { pass: boolean; message: () => string } {
  try {
    const { error } = schema.validate(received);
    const pass = !error;

    return {
      pass,
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to match schema`
          : `expected ${JSON.stringify(received)} to match schema: ${error?.message}`,
    };
  } catch (error) {
    return {
      pass: false,
      message: () => `schema validation failed: ${error}`,
    };
  }
}

/**
 * Range validation
 */
export function toBeWithinRange(
  received: any,
  min: number,
  max: number
): { pass: boolean; message: () => string } {
  const pass = typeof received === 'number' && received >= min && received <= max;

  return {
    pass,
    message: () => `expected ${received} to be within range ${min} to ${max}`,
  };
}

/**
 * Health response validation
 */
export function toBeValidHealthResponse(
  received: any,
  serviceName?: string
): { pass: boolean; message: () => string } {
  const isValidStructure =
    received &&
    typeof received === 'object' &&
    received.status === 'healthy' &&
    typeof received.service === 'string' &&
    typeof received.timestamp === 'string' &&
    received.port !== undefined;

  const isValidService = !serviceName || received.service === serviceName;
  const isValidTimestamp = !isNaN(Date.parse(received.timestamp));

  const pass = isValidStructure && isValidService && isValidTimestamp;

  return {
    pass,
    message: () =>
      `expected ${JSON.stringify(received)} to be a valid health response${serviceName ? ` for ${serviceName}` : ''}`,
  };
}

/**
 * Location data validation
 */
export function toBeValidLocationData(received: any): { pass: boolean; message: () => string } {
  const requiredFields = ['latitude', 'longitude', 'timestamp'];
  const optionalFields = ['accuracy', 'altitude', 'heading', 'speed'];

  const hasRequiredFields = requiredFields.every(
    field => received && received[field] !== undefined
  );

  const validLatitude =
    typeof received?.latitude === 'number' && received.latitude >= -90 && received.latitude <= 90;

  const validLongitude =
    typeof received?.longitude === 'number' &&
    received.longitude >= -180 &&
    received.longitude <= 180;

  const validTimestamp = !isNaN(Date.parse(received?.timestamp));

  const pass = hasRequiredFields && validLatitude && validLongitude && validTimestamp;

  return {
    pass,
    message: () => `expected ${JSON.stringify(received)} to be valid location data`,
  };
}

/**
 * Route data validation
 */
export function toBeValidRouteData(received: any): { pass: boolean; message: () => string } {
  const requiredFields = ['id', 'routeNumber', 'routeName', 'isActive'];

  const hasRequiredFields = requiredFields.every(
    field => received && received[field] !== undefined
  );

  const validRouteNumber =
    typeof received?.routeNumber === 'string' && /^[0-9]{1,3}[A-Z]?$/.test(received.routeNumber);

  const validId = typeof received?.id === 'string' && received.id.length > 0;
  const validName = typeof received?.routeName === 'string' && received.routeName.length > 0;
  const validActive = typeof received?.isActive === 'boolean';

  const pass = hasRequiredFields && validRouteNumber && validId && validName && validActive;

  return {
    pass,
    message: () => `expected ${JSON.stringify(received)} to be valid route data`,
  };
}

/**
 * Array validation helpers
 */
export const ArrayAssertions = {
  /**
   * Assert array has unique values
   */
  toHaveUniqueValues(array: any[]): void {
    const uniqueValues = new Set(array);
    expect(uniqueValues.size).toBe(array.length);
  },

  /**
   * Assert array is sorted
   */
  toBeSorted(array: any[], compareFn?: (a: any, b: any) => number): void {
    const sorted = [...array].sort(compareFn);
    expect(array).toEqual(sorted);
  },

  /**
   * Assert array contains only specific types
   */
  toContainOnlyType(array: any[], type: string): void {
    array.forEach(item => {
      expect(typeof item).toBe(type);
    });
  },
};

/**
 * Date and time assertion helpers
 */
export const DateAssertions = {
  /**
   * Assert date is recent (within specified seconds)
   */
  toBeRecent(date: Date | string, withinSeconds = 10): void {
    const dateObj = new Date(date);
    const now = new Date();
    const diffSeconds = (now.getTime() - dateObj.getTime()) / 1000;

    expect(diffSeconds).toBeLessThanOrEqual(withinSeconds);
    expect(diffSeconds).toBeGreaterThanOrEqual(0);
  },

  /**
   * Assert date is in the future
   */
  toBeInFuture(date: Date | string): void {
    const dateObj = new Date(date);
    const now = new Date();

    expect(dateObj.getTime()).toBeGreaterThan(now.getTime());
  },

  /**
   * Assert date is in the past
   */
  toBeInPast(date: Date | string): void {
    const dateObj = new Date(date);
    const now = new Date();

    expect(dateObj.getTime()).toBeLessThan(now.getTime());
  },
};

/**
 * Performance assertion helpers
 */
export const PerformanceAssertions = {
  /**
   * Assert operation completes within time limit
   */
  async toCompleteWithin(operation: () => Promise<any>, maxMs: number): Promise<void> {
    const start = Date.now();
    await operation();
    const duration = Date.now() - start;

    expect(duration).toBeLessThanOrEqual(maxMs);
  },

  /**
   * Assert memory usage is reasonable
   */
  toHaveReasonableMemoryUsage(beforeMb: number, afterMb: number, maxIncreaseMb = 50): void {
    const increase = afterMb - beforeMb;
    expect(increase).toBeLessThanOrEqual(maxIncreaseMb);
  },
};

/**
 * HTTP Test Helpers
 * Utilities for testing HTTP endpoints and responses
 */

import request from 'supertest';
import { Express } from 'express';

export interface HealthCheckResponse {
  status: string;
  service: string;
  timestamp: string;
  port: string | number;
}

export interface ServiceResponse {
  message: string;
  status: string;
  version: string;
}

/**
 * Test health endpoint
 */
export async function testHealthEndpoint(
  app: Express,
  expectedService: string,
  expectedPort?: string | number
): Promise<HealthCheckResponse> {
  const response = await request(app).get('/health').expect(200);

  expect(response.body).toMatchObject({
    status: 'healthy',
    service: expectedService,
    timestamp: expect.any(String),
    port: expectedPort ? expectedPort.toString() : expect.any(String),
  });

  return response.body;
}

/**
 * Test root endpoint
 */
export async function testRootEndpoint(
  app: Express,
  expectedMessage: string
): Promise<ServiceResponse> {
  const response = await request(app).get('/').expect(200);

  expect(response.body).toMatchObject({
    message: expectedMessage,
    status: 'running',
    version: expect.any(String),
  });

  return response.body;
}

/**
 * Test service endpoints with common patterns
 */
export class ServiceTester {
  private app: Express;

  private serviceName: string;

  private port: string | number;

  constructor(app: Express, serviceName: string, port: string | number) {
    this.app = app;
    this.serviceName = serviceName;
    this.port = port;
  }

  /**
   * Test all basic endpoints
   */
  async testBasicEndpoints(): Promise<void> {
    await this.testHealth();
    await this.testRoot();
  }

  /**
   * Test health endpoint
   */
  async testHealth(): Promise<HealthCheckResponse> {
    return testHealthEndpoint(this.app, this.serviceName, this.port);
  }

  /**
   * Test root endpoint
   */
  async testRoot(): Promise<ServiceResponse> {
    const expectedMessage = `BMTC Transit App ${this.serviceName.charAt(0).toUpperCase() + this.serviceName.slice(1)}`;
    return testRootEndpoint(this.app, expectedMessage);
  }

  /**
   * Test endpoint with authentication
   */
  async testAuthenticatedEndpoint(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    token?: string,
    data?: any
  ): Promise<request.Response> {
    let req = request(this.app)[method](path);

    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }

    if (data && (method === 'post' || method === 'put')) {
      req = req.send(data);
    }

    return req;
  }

  /**
   * Test rate limiting
   */
  async testRateLimit(path: string, limit: number): Promise<void> {
    const requests = [];

    // Make requests up to the limit
    for (let i = 0; i < limit; i++) {
      requests.push(request(this.app).get(path));
    }

    const responses = await Promise.all(requests);

    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBeLessThan(400);
    });

    // Next request should be rate limited
    const rateLimitedResponse = await request(this.app).get(path);
    expect(rateLimitedResponse.status).toBe(429);
  }
}

/**
 * HTTP status code helpers
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Common HTTP test patterns
 */
export const HttpTestPatterns = {
  /**
   * Test CORS headers
   */
  async testCors(app: Express, path = '/'): Promise<void> {
    const response = await request(app)
      .options(path)
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeDefined();
    expect(response.headers['access-control-allow-methods']).toBeDefined();
  },

  /**
   * Test security headers
   */
  async testSecurityHeaders(app: Express, path = '/'): Promise<void> {
    const response = await request(app).get(path);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['x-xss-protection']).toBeDefined();
  },

  /**
   * Test compression
   */
  async testCompression(app: Express, path = '/'): Promise<void> {
    const response = await request(app).get(path).set('Accept-Encoding', 'gzip');

    if (response.text && response.text.length > 1024) {
      expect(response.headers['content-encoding']).toBe('gzip');
    }
  },
};

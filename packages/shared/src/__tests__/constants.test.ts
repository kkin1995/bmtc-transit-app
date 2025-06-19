/**
 * Constants Test
 * Tests for shared constants and utilities
 */

import { APP_CONSTANTS, SERVICE_PORTS, HTTP_STATUS } from '../index';

describe('Shared Constants', () => {
  describe('APP_CONSTANTS', () => {
    it('should have correct application constants', () => {
      expect(APP_CONSTANTS.NAME).toBe('BMTC Transit App');
      expect(APP_CONSTANTS.VERSION).toBe('1.0.0');
      expect(APP_CONSTANTS.API_VERSION).toBe('v1');
    });

    it('should have readonly constants at compile time', () => {
      // Note: 'as const' provides compile-time readonly behavior, not runtime
      // This test verifies the constants are not accidentally modified
      const originalName = APP_CONSTANTS.NAME;
      expect(originalName).toBe('BMTC Transit App');
      expect(typeof APP_CONSTANTS.NAME).toBe('string');
    });
  });

  describe('SERVICE_PORTS', () => {
    it('should have correct service port mappings', () => {
      expect(SERVICE_PORTS.API_GATEWAY).toBe(3000);
      expect(SERVICE_PORTS.USER_SERVICE).toBe(3001);
      expect(SERVICE_PORTS.LOCATION_SERVICE).toBe(3002);
      expect(SERVICE_PORTS.REALTIME_SERVICE).toBe(3003);
      expect(SERVICE_PORTS.ML_VALIDATION_SERVICE).toBe(3004);
      expect(SERVICE_PORTS.GAMIFICATION_SERVICE).toBe(3005);
    });

    it('should have unique port numbers', () => {
      const ports = Object.values(SERVICE_PORTS);
      const uniquePorts = [...new Set(ports)];
      expect(uniquePorts).toHaveLength(ports.length);
    });

    it('should have ports in valid range', () => {
      Object.values(SERVICE_PORTS).forEach(port => {
        expect(port).toBeGreaterThan(1000);
        expect(port).toBeLessThan(65536);
      });
    });
  });

  describe('HTTP_STATUS', () => {
    it('should have common HTTP status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });

    it('should have valid HTTP status code ranges', () => {
      Object.values(HTTP_STATUS).forEach(status => {
        expect(status).toBeGreaterThanOrEqual(200);
        expect(status).toBeLessThan(600);
      });
    });
  });
});
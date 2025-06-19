/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * Location Service Entry Point
 * Main entry point for the BMTC Transit App Location Processing Service
 */
import express from 'express';

const LOCATION_SERVICE_PORT = process.env.PORT ?? '3002';
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'location-service',
    timestamp: new Date().toISOString(),
    port: LOCATION_SERVICE_PORT,
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BMTC Transit App Location Service',
    status: 'running',
    version: '1.0.0',
  });
});

/**
 * Starts the Location Service
 */
export const startLocationService = (): void => {
  app.listen(LOCATION_SERVICE_PORT, () => {
    console.log(`Location Service started on port ${LOCATION_SERVICE_PORT}`);
    console.log('Health endpoint available at /health');
  });
};

/**
 * Main execution
 */
if (require.main === module) {
  startLocationService();
}

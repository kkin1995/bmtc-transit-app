/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * User Service Entry Point
 * Main entry point for the BMTC Transit App User Management Service
 */
import express from 'express';

const USER_SERVICE_PORT = process.env.PORT ?? '3001';
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    port: USER_SERVICE_PORT,
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BMTC Transit App User Service',
    status: 'running',
    version: '1.0.0',
  });
});

/**
 * Starts the User Service
 */
export const startUserService = (): void => {
  app.listen(USER_SERVICE_PORT, () => {
    console.log(`User Service started on port ${USER_SERVICE_PORT}`);
    console.log('Health endpoint available at /health');
  });
};

/**
 * Main execution
 */
if (require.main === module) {
  startUserService();
}

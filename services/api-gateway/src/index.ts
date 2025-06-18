/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * API Gateway Service Entry Point
 * Main entry point for the BMTC Transit App API Gateway
 */
import express from 'express';

const API_GATEWAY_PORT = process.env.PORT || 3000;
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    port: API_GATEWAY_PORT
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BMTC Transit App API Gateway',
    status: 'running',
    version: '1.0.0'
  });
});

/**
 * Starts the API Gateway service
 */
export const startApiGateway = (): void => {
  app.listen(API_GATEWAY_PORT, () => {
    console.log(`API Gateway started on port ${API_GATEWAY_PORT}`);
    console.log('Health endpoint available at /health');
  });
};

/**
 * Main execution
 */
if (require.main === module) {
  startApiGateway();
}

/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * ML Validation Service Entry Point
 * Main entry point for the BMTC Transit App Machine Learning Validation Service
 */
import express from 'express';

const ML_VALIDATION_SERVICE_PORT = process.env.PORT ?? '3004';
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ml-validation-service',
    timestamp: new Date().toISOString(),
    port: ML_VALIDATION_SERVICE_PORT,
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BMTC Transit App ML Validation Service',
    status: 'running',
    version: '1.0.0',
  });
});

/**
 * Starts the ML Validation Service
 */
export const startMlValidationService = (): void => {
  app.listen(ML_VALIDATION_SERVICE_PORT, () => {
    console.log(`ML Validation Service started on port ${ML_VALIDATION_SERVICE_PORT}`);
    console.log('Health endpoint available at /health');
  });
};

/**
 * Main execution
 */
if (require.main === module) {
  startMlValidationService();
}

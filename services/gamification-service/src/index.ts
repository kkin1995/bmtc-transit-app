/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * Gamification Service Entry Point
 * Main entry point for the BMTC Transit App Gamification Service
 */
import express from 'express';

const GAMIFICATION_SERVICE_PORT = process.env.PORT ?? '3005';
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'gamification-service',
    timestamp: new Date().toISOString(),
    port: GAMIFICATION_SERVICE_PORT,
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BMTC Transit App Gamification Service',
    status: 'running',
    version: '1.0.0',
  });
});

/**
 * Starts the Gamification Service
 */
export const startGamificationService = (): void => {
  app.listen(GAMIFICATION_SERVICE_PORT, () => {
    console.log(`Gamification Service started on port ${GAMIFICATION_SERVICE_PORT}`);
    console.log('Health endpoint available at /health');
  });
};

/**
 * Main execution
 */
if (require.main === module) {
  startGamificationService();
}

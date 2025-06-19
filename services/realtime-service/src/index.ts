/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * Real-time Service Entry Point
 * Main entry point for the BMTC Transit App Real-time WebSocket Service
 */
import express from 'express';

const REALTIME_SERVICE_PORT = process.env.PORT ?? '3003';
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'realtime-service',
    timestamp: new Date().toISOString(),
    port: REALTIME_SERVICE_PORT,
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BMTC Transit App Real-time Service',
    status: 'running',
    version: '1.0.0',
  });
});

/**
 * Starts the Real-time Service
 */
export const startRealtimeService = (): void => {
  app.listen(REALTIME_SERVICE_PORT, () => {
    console.log(`Real-time Service started on port ${REALTIME_SERVICE_PORT}`);
    console.log('Health endpoint available at /health');
  });
};

/**
 * Main execution
 */
if (require.main === module) {
  startRealtimeService();
}

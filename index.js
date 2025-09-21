const app = require('./app');
const config = require('./utils/config');
const logger = require('./utils/logger');
const cron = require('node-cron');

// Import background job
const syncContent = require('./jobs/syncContent');

// Start the server
const server = app.listen(config.port, () => {
  logger.info(`🚀 Server running on port ${config.port}`, {
    environment: config.nodeEnv,
    port: config.port,
    nodeVersion: process.version,
  });
});

// Schedule content sync job (runs every hour)
if (config.nodeEnv !== 'test') {
  cron.schedule('0 * * * *', async () => {
    logger.info('🔄 Starting scheduled content sync...');
    try {
      await syncContent.run();
      logger.info('✅ Scheduled content sync completed successfully');
    } catch (error) {
      logger.error('❌ Scheduled content sync failed:', error);
    }
  });

  // Run initial sync on startup
  setTimeout(async () => {
    logger.info('🔄 Running initial content sync...');
    try {
      await syncContent.run();
      logger.info('✅ Initial content sync completed successfully');
    } catch (error) {
      logger.error('❌ Initial content sync failed:', error);
    }
  }, 5000); // Wait 5 seconds after startup
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

module.exports = server;
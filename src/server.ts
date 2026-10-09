import { app } from './app';
import { env } from './config/env';
import { prisma, checkDatabaseConnection } from './config/database';
import { Logger } from './utils/logger';

const server = app.listen(env.PORT, async () => {
  Logger.info(`🚀 Smart Print Order & Job Management System is running!`);
  Logger.info(`📍 Server listening on http://localhost:${env.PORT}`);
  Logger.info(`📚 Swagger Documentation available at http://localhost:${env.PORT}/api/docs`);
  Logger.info(`🩺 Health check at http://localhost:${env.PORT}/health`);

  // Check database
  await checkDatabaseConnection();
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  Logger.info(`Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    Logger.info('HTTP server closed.');
    await prisma.$disconnect();
    Logger.info('Database connection closed.');
    process.exit(0);
  });

  setTimeout(() => {
    Logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;

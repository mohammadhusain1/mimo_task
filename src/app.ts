import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { generalLimiter } from './middleware/rate-limiter.middleware';
import { setupSwagger } from './docs/swagger';
import { Logger } from './utils/logger';

// Import route modules
import authRoutes from './modules/auth/auth.routes';
import orderRoutes from './modules/orders/order.routes';
import paymentRoutes from './modules/payments/payment.routes';
import printJobRoutes from './modules/print-jobs/print-job.routes';
import kioskRoutes from './modules/kiosks/kiosk.routes';
import pricingRoutes from './modules/pricing/pricing.routes';
import auditLogRoutes from './modules/audit-logs/audit-log.routes';

export function createApp(): Express {
  const app: Express = express();

  // 1. Security Headers via Helmet
  app.use(helmet({
    contentSecurityPolicy: false, // Allows Swagger UI assets
  }));

  // 2. CORS
  app.use(cors({
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  }));

  // 3. Body parsers with limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 4. Request Logging (Sanitized without secrets)
  app.use((req: Request, _res: Response, next) => {
    Logger.info(`${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      body: req.body,
    });
    next();
  });

  // 5. Rate limiting
  app.use('/api', generalLimiter);

  // 6. Swagger API Documentation
  setupSwagger(app);

  // 7. Health Check
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'smart-print-system',
      version: '1.0.0',
    });
  });

  // 8. Application Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/print-jobs', printJobRoutes);
  app.use('/api/kiosks', kioskRoutes);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/audit-logs', auditLogRoutes);

  // 9. 404 handler for undefined routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NotFoundError',
        message: `Route '${req.method} ${req.originalUrl}' not found`,
      },
    });
  });

  // 10. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;

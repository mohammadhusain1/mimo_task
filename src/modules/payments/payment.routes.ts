import { Router } from 'express';
import { PaymentController } from './payment.controller';
import { validate } from '../../middleware/validate.middleware';
import { simulatePaymentResultSchema } from './payment.schema';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Endpoint: POST /api/payments/:paymentId/success (Requires authentication and CUSTOMER or ADMIN role)
router.post(
  '/:paymentId/success',
  authenticate,
  requireRole(Role.ADMIN, Role.CUSTOMER),
  validate(simulatePaymentResultSchema),
  PaymentController.paymentSuccess
);

// Endpoint: POST /api/payments/:paymentId/failure (Requires authentication and CUSTOMER or ADMIN role)
router.post(
  '/:paymentId/failure',
  authenticate,
  requireRole(Role.ADMIN, Role.CUSTOMER),
  validate(simulatePaymentResultSchema),
  PaymentController.paymentFailure
);

export default router;

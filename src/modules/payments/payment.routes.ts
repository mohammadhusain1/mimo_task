import { Router } from 'express';
import { PaymentController } from './payment.controller';
import { validate } from '../../middleware/validate.middleware';
import { simulatePaymentResultSchema } from './payment.schema';
import { optionalAuthenticate } from '../../middleware/auth.middleware';

const router = Router();

// Endpoint: POST /api/payments/:paymentId/success
router.post(
  '/:paymentId/success',
  optionalAuthenticate,
  validate(simulatePaymentResultSchema),
  PaymentController.paymentSuccess
);

// Endpoint: POST /api/payments/:paymentId/failure
router.post(
  '/:paymentId/failure',
  optionalAuthenticate,
  validate(simulatePaymentResultSchema),
  PaymentController.paymentFailure
);

export default router;

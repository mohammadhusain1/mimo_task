import { Router } from 'express';
import { OrderController } from './order.controller';
import { PaymentController } from '../payments/payment.controller';
import { validate } from '../../middleware/validate.middleware';
import {
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  getOrdersQuerySchema,
} from './order.schema';
import { initiatePaymentSchema } from '../payments/payment.schema';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware';

const router = Router();

// Order creation - supports optional token (validates customer if provided) or direct creation
router.post('/', optionalAuthenticate, validate(createOrderSchema), OrderController.createOrder);

// Order listing with filters & pagination
router.get('/', optionalAuthenticate, validate(getOrdersQuerySchema), OrderController.listOrders);

// Order details by ID
router.get('/:orderId', optionalAuthenticate, OrderController.getOrderById);

// Initiate payment for order: POST /api/orders/:orderId/payment
router.post('/:orderId/payment', optionalAuthenticate, validate(initiatePaymentSchema), PaymentController.initiatePayment);

// State transition
router.patch('/:orderId/status', optionalAuthenticate, validate(updateOrderStatusSchema), OrderController.transitionStatus);

// Cancel order
router.post('/:orderId/cancel', optionalAuthenticate, validate(cancelOrderSchema), OrderController.cancelOrder);

// Audit logs for an order
router.get('/:orderId/audit-logs', optionalAuthenticate, OrderController.getOrderAuditLogs);

export default router;

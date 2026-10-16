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
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Order creation - requires authentication, accessible by CUSTOMER and ADMIN
router.post(
  '/',
  authenticate,
  requireRole(Role.CUSTOMER, Role.ADMIN),
  validate(createOrderSchema),
  OrderController.createOrder
);

// Order listing with filters & pagination - requires authentication, scoped by role
router.get(
  '/',
  authenticate,
  validate(getOrdersQuerySchema),
  OrderController.listOrders
);

// Order details by ID - requires authentication, authorized by role/ownership
router.get(
  '/:orderId',
  authenticate,
  OrderController.getOrderById
);

// Initiate payment for order: POST /api/orders/:orderId/payment - requires authentication
router.post(
  '/:orderId/payment',
  authenticate,
  requireRole(Role.CUSTOMER, Role.ADMIN),
  validate(initiatePaymentSchema),
  PaymentController.initiatePayment
);

// State transition - strictly restricted to ADMIN
router.patch(
  '/:orderId/status',
  authenticate,
  requireRole(Role.ADMIN),
  validate(updateOrderStatusSchema),
  OrderController.transitionStatus
);

// Cancel order - requires authentication, CUSTOMER or ADMIN
router.post(
  '/:orderId/cancel',
  authenticate,
  requireRole(Role.CUSTOMER, Role.ADMIN),
  validate(cancelOrderSchema),
  OrderController.cancelOrder
);

// Audit logs for an order - requires authentication, scoped to authorized parties
router.get(
  '/:orderId/audit-logs',
  authenticate,
  OrderController.getOrderAuditLogs
);

export default router;

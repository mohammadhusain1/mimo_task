import { PaymentStatus, OrderStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ConflictError, BadRequestError, UnauthorizedError, ForbiddenError } from '../../utils/errors';
import { OrderStateMachineService } from '../../services/state-machine.service';
import { AuthUser } from '../../middleware/auth.middleware';
import { Logger } from '../../utils/logger';

export class PaymentService {
  private static generateTransactionRef(): string {
    return `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  }

  private static generatePaymentId(): string {
    return `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }

  /**
   * Initiate payment for an order with idempotency check
   */
  static async initiatePayment(
    orderId: string,
    options?: { idempotencyKey?: string; provider?: string },
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (currentUser.role === 'KIOSK_OPERATOR') {
      throw new ForbiddenError('Kiosk operators cannot initiate customer payments');
    }

    const idempotencyKey = options?.idempotencyKey;
    const provider = options?.provider || 'SIMULATED';

    // 1. Fetch order & perform customer ownership authorization
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found`);
    }

    if (currentUser.role === 'CUSTOMER' && order.customerId !== currentUser.customerId) {
      throw new ForbiddenError('You are not authorized to initiate payment for another customer\'s order');
    }

    // 2. Idempotency check: if key already used, return existing payment
    if (idempotencyKey) {
      const existingPayment = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: { order: true },
      });

      if (existingPayment) {
        if (existingPayment.orderId !== orderId) {
          throw new ConflictError('Idempotency key was previously used for a different order');
        }
        Logger.info(`Idempotent payment initiation returned for order ${orderId}, key: ${idempotencyKey}`);
        return {
          payment: existingPayment,
          isDuplicate: true,
          message: 'Payment already initiated for this idempotency key',
        };
      }
    }

    // Check if order is already paid or cancelled
    if (order.status === OrderStatus.PAID) {
      throw new ConflictError(`Order '${orderId}' has already been paid`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictError(`Order '${orderId}' is cancelled and cannot accept payments`);
    }

    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.PRINTING) {
      throw new ConflictError(`Order '${orderId}' is already processing or completed`);
    }

    // 3. Atomically transition order to PAYMENT_PENDING if currently CREATED, and create Payment record
    const result = await prisma.$transaction(async (tx) => {
      // Transition order status to PAYMENT_PENDING if needed
      if (order.status === OrderStatus.CREATED) {
        await tx.order.update({
          where: { id: order.id, version: order.version },
          data: {
            status: OrderStatus.PAYMENT_PENDING,
            version: { increment: 1 },
          },
        });
      }

      const paymentId = this.generatePaymentId();
      const transactionRef = this.generateTransactionRef();

      const newPayment = await tx.payment.create({
        data: {
          id: paymentId,
          orderId: order.id,
          amount: order.totalPrice,
          currency: order.currency,
          status: PaymentStatus.PENDING,
          transactionRef,
          idempotencyKey: idempotencyKey || null,
          provider,
        },
      });

      return newPayment;
    });

    Logger.info(`Payment initiated for order ${orderId}: ${result.id}`, { transactionRef: result.transactionRef });

    return {
      payment: result,
      isDuplicate: false,
      simulationEndpoints: {
        successUrl: `/api/payments/${result.id}/success`,
        failureUrl: `/api/payments/${result.id}/failure`,
      },
    };
  }

  /**
   * Process simulated or provider payment success
   * Securely verifies authorization and executes payment status, order transition, and audit log atomically in one transaction
   */
  static async handlePaymentSuccess(
    paymentId: string,
    options?: { transactionRef?: string },
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundError(`Payment with ID '${paymentId}' not found`);
    }

    // Authorization: only the order customer or ADMIN can mark payment success
    if (currentUser.role === 'CUSTOMER') {
      if (payment.order.customerId !== currentUser.customerId) {
        throw new ForbiddenError('You are not authorized to process payment for this order');
      }
    } else if (currentUser.role === 'KIOSK_OPERATOR') {
      throw new ForbiddenError('Kiosk operators are not authorized to process payments');
    }

    // Status checks
    if (payment.order.status === OrderStatus.CANCELLED) {
      throw new ConflictError('Cannot process payment for a cancelled order');
    }

    // Idempotent check
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        payment,
        order: payment.order,
        message: 'Payment was already processed successfully',
      };
    }

    if (payment.status === PaymentStatus.FAILED) {
      throw new ConflictError('Cannot mark an already failed payment as successful');
    }

    // Process success atomically: Payment update, Order transition, and Audit log in ONE transaction
    const result = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.SUCCESS,
          ...(options?.transactionRef ? { transactionRef: options.transactionRef } : {}),
        },
      });

      const updatedOrder = await OrderStateMachineService.transition({
        orderId: payment.orderId,
        targetStatus: OrderStatus.PAID,
        userId: currentUser.id,
        reason: 'Payment confirmed successfully',
        metadata: {
          paymentId: payment.id,
          amount: payment.amount,
          transactionRef: updatedPayment.transactionRef,
          provider: payment.provider,
        },
        expectedVersion: payment.order.version,
      }, tx);

      return {
        payment: updatedPayment,
        order: updatedOrder,
        message: 'Payment processed successfully and order marked as PAID',
      };
    });

    return result;
  }

  /**
   * Process simulated or provider payment failure
   * Securely verifies authorization and executes payment status, order transition, and audit log atomically in one transaction
   */
  static async handlePaymentFailure(
    paymentId: string,
    options?: { reason?: string },
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundError(`Payment with ID '${paymentId}' not found`);
    }

    // Authorization
    if (currentUser.role === 'CUSTOMER') {
      if (payment.order.customerId !== currentUser.customerId) {
        throw new ForbiddenError('You are not authorized to process payment for this order');
      }
    } else if (currentUser.role === 'KIOSK_OPERATOR') {
      throw new ForbiddenError('Kiosk operators are not authorized to process payments');
    }

    // Status checks
    if (payment.order.status === OrderStatus.CANCELLED) {
      throw new ConflictError('Cannot process payment for a cancelled order');
    }

    // Idempotent check
    if (payment.status === PaymentStatus.FAILED) {
      return {
        payment,
        order: payment.order,
        message: 'Payment was already recorded as failed',
      };
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      throw new ConflictError('Cannot fail a payment that has already succeeded');
    }

    const failureReason = options?.reason || 'Payment processing failed';

    // Process failure atomically: Payment update, Order transition, and Audit log in ONE transaction
    const result = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.FAILED,
          errorMessage: failureReason,
        },
      });

      const updatedOrder = await OrderStateMachineService.transition({
        orderId: payment.orderId,
        targetStatus: OrderStatus.PAYMENT_FAILED,
        userId: currentUser.id,
        reason: failureReason,
        metadata: {
          paymentId: payment.id,
          amount: payment.amount,
          transactionRef: payment.transactionRef,
          errorMessage: failureReason,
        },
        expectedVersion: payment.order.version,
      }, tx);

      return {
        payment: updatedPayment,
        order: updatedOrder,
        message: 'Payment marked as failed and order status updated to PAYMENT_FAILED',
      };
    });

    return result;
  }
}

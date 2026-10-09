import { OrderStatus, PrintJobStatus, AuditEventType } from '@prisma/client';
import { prisma } from '../config/database';
import { ConflictError, NotFoundError } from '../utils/errors';
import { Logger } from '../utils/logger';

export interface TransitionContext {
  orderId: string;
  targetStatus: OrderStatus;
  userId?: string;
  kioskId?: string;
  reason?: string;
  metadata?: Record<string, any>;
  expectedVersion?: number; // Optimistic locking
}

export class OrderStateMachineService {
  /**
   * Explicit allowlist of valid state transitions
   */
  private static readonly ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    [OrderStatus.CREATED]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
    [OrderStatus.PAYMENT_PENDING]: [OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [OrderStatus.PRINTING, OrderStatus.CANCELLED],
    [OrderStatus.PRINTING]: [OrderStatus.COMPLETED, OrderStatus.PRINT_FAILED],
    [OrderStatus.COMPLETED]: [],      // Terminal state
    [OrderStatus.PAYMENT_FAILED]: [], // Terminal state
    [OrderStatus.PRINT_FAILED]: [],   // Terminal state
    [OrderStatus.CANCELLED]: [],      // Terminal state
  };

  /**
   * Check if transition is valid
   */
  static isValidTransition(current: OrderStatus, target: OrderStatus): boolean {
    const allowed = this.ALLOWED_TRANSITIONS[current] || [];
    return allowed.includes(target);
  }

  /**
   * Map order status change to corresponding print job status change
   */
  static mapOrderToPrintJobStatus(targetStatus: OrderStatus): PrintJobStatus | null {
    switch (targetStatus) {
      case OrderStatus.PRINTING:
        return PrintJobStatus.PRINTING;
      case OrderStatus.COMPLETED:
        return PrintJobStatus.COMPLETED;
      case OrderStatus.PRINT_FAILED:
        return PrintJobStatus.FAILED;
      case OrderStatus.CANCELLED:
        return PrintJobStatus.CANCELLED;
      default:
        return null;
    }
  }

  /**
   * Determine corresponding audit event for status change
   */
  static getAuditEventType(targetStatus: OrderStatus): AuditEventType | null {
    switch (targetStatus) {
      case OrderStatus.PAID:
        return AuditEventType.PAYMENT_SUCCESS;
      case OrderStatus.PAYMENT_FAILED:
        return AuditEventType.PAYMENT_FAILED;
      case OrderStatus.PRINTING:
        return AuditEventType.PRINT_STARTED;
      case OrderStatus.COMPLETED:
        return AuditEventType.PRINT_COMPLETED;
      case OrderStatus.PRINT_FAILED:
        return AuditEventType.PRINT_FAILED;
      case OrderStatus.CANCELLED:
        return AuditEventType.ORDER_CANCELLED;
      default:
        return null;
    }
  }

  /**
   * Transition order to target status inside a database transaction with concurrency locking
   */
  static async transition(context: TransitionContext) {
    const { orderId, targetStatus, userId, kioskId, reason, metadata = {}, expectedVersion } = context;

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current order with print job and locking
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { printJob: true },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID ${orderId} not found`);
      }

      const currentStatus = order.status;

      // 2. Check optimistic concurrency control if version provided
      if (expectedVersion !== undefined && order.version !== expectedVersion) {
        throw new ConflictError(
          `Concurrent modification detected on order ${orderId}. Expected version ${expectedVersion}, but found ${order.version}`
        );
      }

      // 3. Prevent transition to same status
      if (currentStatus === targetStatus) {
        return order;
      }

      // 4. Validate transition allowlist
      if (!this.isValidTransition(currentStatus, targetStatus)) {
        throw new ConflictError(
          `Invalid state transition: Cannot change status from ${currentStatus} to ${targetStatus}`
        );
      }

      // 5. Business rule: ensure printing requires payment
      if (targetStatus === OrderStatus.PRINTING && currentStatus !== OrderStatus.PAID) {
        throw new ConflictError(
          `Cannot start printing order ${orderId}: Order status is ${currentStatus}, but must be PAID.`
        );
      }

      // 6. Business rule: cannot cancel after printing started
      if (targetStatus === OrderStatus.CANCELLED && currentStatus === OrderStatus.PRINTING) {
        throw new ConflictError(
          `Cannot cancel order ${orderId}: Order is already PRINTING.`
        );
      }

      // 7. Update order status and increment version for optimistic locking
      const updatedOrder = await tx.order.update({
        where: {
          id: orderId,
          version: order.version, // Conditional update protects against race conditions
        },
        data: {
          status: targetStatus,
          version: { increment: 1 },
        },
        include: { printJob: true, customer: true, kiosk: true },
      });

      // 8. Update print job status to keep consistent
      const mappedJobStatus = this.mapOrderToPrintJobStatus(targetStatus);
      if (mappedJobStatus && order.printJob) {
        const updateJobData: any = {
          status: mappedJobStatus,
        };

        if (mappedJobStatus === PrintJobStatus.PRINTING) {
          updateJobData.startedAt = new Date();
          updateJobData.attempts = { increment: 1 };
        } else if (mappedJobStatus === PrintJobStatus.COMPLETED) {
          updateJobData.completedAt = new Date();
        } else if (mappedJobStatus === PrintJobStatus.FAILED) {
          updateJobData.completedAt = new Date();
          updateJobData.errorMessage = reason || 'Printing failed at kiosk';
        }

        await tx.printJob.update({
          where: { id: order.printJob.id },
          data: updateJobData,
        });
      }

      // 9. Append transactional audit log
      const auditEvent = this.getAuditEventType(targetStatus);
      if (auditEvent) {
        await tx.auditLog.create({
          data: {
            event: auditEvent,
            orderId: order.id,
            kioskId: kioskId || order.kioskId,
            userId: userId || null,
            previousStatus: currentStatus,
            newStatus: targetStatus,
            metadata: {
              ...metadata,
              reason: reason || null,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }

      Logger.info(`Order ${orderId} transitioned: ${currentStatus} -> ${targetStatus}`, {
        userId,
        targetStatus,
      });

      return updatedOrder;
    });
  }
}

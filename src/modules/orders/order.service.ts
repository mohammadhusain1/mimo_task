import { PaperSize, ColorMode, OrderStatus, PrintJobStatus, AuditEventType, KioskStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../utils/errors';
import { PricingService } from '../../services/pricing.service';
import { FilePageCounterService } from '../../services/file-page-counter.service';
import { OrderStateMachineService } from '../../services/state-machine.service';
import { AuthUser } from '../../middleware/auth.middleware';

export interface CreateOrderDto {
  customerId: string;
  kioskId: string;
  fileUrl: string;
  copies: number;
  paperSize: PaperSize;
  colorMode: ColorMode;
}

export class OrderService {
  /**
   * Helper to generate unique order and job IDs
   */
  private static generateUniqueId(prefix: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create order with automatic print job creation and transactional audit log
   */
  static async createOrder(dto: CreateOrderDto, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const { customerId, kioskId, fileUrl, copies, paperSize, colorMode } = dto;

    // 1. Role permission checks:
    if (currentUser.role === 'KIOSK_OPERATOR') {
      throw new ForbiddenError('Kiosk operators cannot place customer orders');
    }

    if (currentUser.role === 'CUSTOMER' && currentUser.customerId !== customerId) {
      throw new ForbiddenError('Customers can only create orders for their own account');
    }

    // 2. Validate customer exists and is eligible
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundError(`Customer with ID '${customerId}' not found`);
    }

    if (!customer.isActive) {
      throw new BadRequestError(`Customer account '${customerId}' is inactive and cannot place orders`);
    }

    // 3. Validate kiosk exists and is eligible
    const kiosk = await prisma.kiosk.findUnique({
      where: { id: kioskId },
    });

    if (!kiosk) {
      throw new NotFoundError(`Kiosk with ID '${kioskId}' not found`);
    }

    if (kiosk.status !== KioskStatus.ACTIVE) {
      throw new BadRequestError(
        `Kiosk '${kioskId}' is currently in ${kiosk.status} status and cannot accept print orders`
      );
    }

    // 4. Inspect document page count (with SSRF protection & mock provider)
    const pageResult = await FilePageCounterService.getPageCount(fileUrl);
    const pageCount = pageResult.pageCount;

    // 5. Calculate authoritative price server-side
    const priceCalculation = await PricingService.calculatePrice({
      paperSize,
      colorMode,
      copies,
      pageCount,
    });

    const orderId = this.generateUniqueId('ORD');
    const printJobId = this.generateUniqueId('JOB');

    // 6. Atomic transaction for Order, PrintJob, and AuditLog
    const result = await prisma.$transaction(async (tx) => {
      // Create Order
      const newOrder = await tx.order.create({
        data: {
          id: orderId,
          customerId,
          kioskId,
          fileUrl,
          pageCount,
          copies,
          paperSize,
          colorMode,
          basePricePerPage: priceCalculation.basePricePerPage,
          totalPrice: priceCalculation.totalPrice,
          currency: priceCalculation.currency,
          status: OrderStatus.CREATED,
        },
      });

      // Create linked PrintJob
      const newJob = await tx.printJob.create({
        data: {
          id: printJobId,
          orderId: newOrder.id,
          kioskId,
          status: PrintJobStatus.QUEUED,
          attempts: 0,
        },
      });

      // Create initial audit log
      const auditLog = await tx.auditLog.create({
        data: {
          event: AuditEventType.ORDER_CREATED,
          orderId: newOrder.id,
          kioskId,
          userId: currentUser.id,
          previousStatus: null,
          newStatus: OrderStatus.CREATED,
          metadata: {
            pageCount,
            copies,
            paperSize,
            colorMode,
            basePricePerPage: priceCalculation.basePricePerPage,
            totalPrice: priceCalculation.totalPrice,
            pageCountSource: pageResult.source,
          },
        },
      });

      return {
        order: newOrder,
        printJob: newJob,
        auditLogId: auditLog.id,
      };
    });

    return {
      orderId: result.order.id,
      status: result.order.status,
      customerId: result.order.customerId,
      kioskId: result.order.kioskId,
      fileUrl: result.order.fileUrl,
      specifications: {
        paperSize: result.order.paperSize,
        colorMode: result.order.colorMode,
        pageCount: result.order.pageCount,
        copies: result.order.copies,
        totalPagesToPrint: result.order.pageCount * result.order.copies,
      },
      pricing: {
        basePricePerPageCents: result.order.basePricePerPage,
        totalPriceCents: result.order.totalPrice,
        currency: result.order.currency,
        formattedTotalPrice: priceCalculation.formattedTotalPrice,
      },
      printJob: {
        id: result.printJob.id,
        status: result.printJob.status,
        kioskId: result.printJob.kioskId,
        attempts: result.printJob.attempts,
        createdAt: result.printJob.createdAt,
      },
      createdAt: result.order.createdAt,
    };
  }

  /**
   * Retrieve order with full associations and access control
   */
  static async getOrderById(orderId: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        printJob: true,
        payments: true,
        customer: true,
        kiosk: true,
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found`);
    }

    // Role-based access control
    if (currentUser.role === 'CUSTOMER' && order.customerId !== currentUser.customerId) {
      throw new ForbiddenError('You do not have permission to access another customer\'s order');
    }

    if (
      currentUser.role === 'KIOSK_OPERATOR' &&
      !currentUser.assignedKioskIds.includes(order.kioskId)
    ) {
      throw new ForbiddenError('You are not authorized to access orders for this kiosk');
    }

    return order;
  }

  /**
   * List orders with pagination and filtering
   */
  static async listOrders(
    query: {
      page?: number;
      limit?: number;
      customerId?: string;
      kioskId?: string;
      status?: OrderStatus;
    },
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Apply role-based filtering
    if (currentUser.role === 'CUSTOMER') {
      where.customerId = currentUser.customerId;
    } else if (currentUser.role === 'KIOSK_OPERATOR') {
      where.kioskId = { in: currentUser.assignedKioskIds };
    }

    if (query.customerId && currentUser.role === 'ADMIN') {
      where.customerId = query.customerId;
    }

    if (query.kioskId && currentUser.role === 'ADMIN') {
      where.kioskId = query.kioskId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          printJob: true,
          customer: { select: { id: true, name: true, email: true } },
          kiosk: { select: { id: true, name: true, location: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Request validated status transition (Admin only manual transition)
   */
  static async transitionStatus(
    orderId: string,
    targetStatus: OrderStatus,
    reason?: string,
    expectedVersion?: number,
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can manually update order status');
    }

    const order = await this.getOrderById(orderId, currentUser);

    return await OrderStateMachineService.transition({
      orderId: order.id,
      targetStatus,
      userId: currentUser.id,
      kioskId: order.kioskId,
      reason,
      expectedVersion,
    });
  }

  /**
   * Cancel an eligible order
   */
  static async cancelOrder(orderId: string, reason?: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (currentUser.role === 'KIOSK_OPERATOR') {
      throw new ForbiddenError('Kiosk operators cannot cancel customer orders');
    }

    const order = await this.getOrderById(orderId, currentUser);

    return await OrderStateMachineService.transition({
      orderId: order.id,
      targetStatus: OrderStatus.CANCELLED,
      userId: currentUser.id,
      kioskId: order.kioskId,
      reason: reason || 'Order cancelled by user',
      expectedVersion: order.version,
    });
  }

  /**
   * Retrieve audit logs for an order
   */
  static async getOrderAuditLogs(orderId: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    // Check permission to view order
    await this.getOrderById(orderId, currentUser);

    return await prisma.auditLog.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });
  }
}

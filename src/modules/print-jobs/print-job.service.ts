import { PrintJobStatus, OrderStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';
import { OrderStateMachineService } from '../../services/state-machine.service';
import { MockPrinterAdapter } from '../../services/printer-adapter.service';
import { AuthUser } from '../../middleware/auth.middleware';
import { Logger } from '../../utils/logger';

export class PrintJobService {
  /**
   * Check if current user is authorized to perform action on job
   */
  private static authorizeJobAction(job: { kioskId: string; order?: { customerId: string } | null }, currentUser?: AuthUser) {
    if (!currentUser) return;

    if (currentUser.role === 'ADMIN') return;

    if (currentUser.role === 'KIOSK_OPERATOR') {
      if (!currentUser.assignedKioskIds.includes(job.kioskId)) {
        throw new ForbiddenError(`Kiosk operator is not authorized to process jobs for kiosk '${job.kioskId}'`);
      }
      return;
    }

    if (currentUser.role === 'CUSTOMER') {
      if (!job.order || job.order.customerId !== currentUser.customerId) {
        throw new ForbiddenError('Customers cannot access or modify unauthorized print jobs');
      }
    }
  }

  /**
   * Start print job: Order must be PAID, Kiosk operator must be authorized
   */
  static async startPrintJob(jobId: string, currentUser?: AuthUser) {
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        order: true,
        kiosk: true,
      },
    });

    if (!job) {
      throw new NotFoundError(`Print job with ID '${jobId}' not found`);
    }

    // 1. Authorize operator
    this.authorizeJobAction(job, currentUser);

    // 2. Prevent duplicate execution or invalid state
    if (job.status === PrintJobStatus.PRINTING) {
      throw new ConflictError(`Print job '${jobId}' is already in PRINTING status`);
    }

    if (job.status === PrintJobStatus.COMPLETED) {
      throw new ConflictError(`Print job '${jobId}' is already completed`);
    }

    // 3. Rule: Job must not start until its order is PAID
    if (job.order.status !== OrderStatus.PAID) {
      throw new ConflictError(
        `Cannot start print job '${jobId}': Associated order status is '${job.order.status}', but must be 'PAID'.`
      );
    }

    // 4. Send to mock printer hardware adapter
    const adapterResponse = await MockPrinterAdapter.sendToPrinter({
      jobId: job.id,
      orderId: job.order.id,
      kioskId: job.kioskId,
      fileUrl: job.order.fileUrl,
      copies: job.order.copies,
      paperSize: job.order.paperSize,
      colorMode: job.order.colorMode,
    });

    if (!adapterResponse.success) {
      // If hardware simulator returned failure, immediately record failure
      return await this.failPrintJob(jobId, adapterResponse.message, currentUser);
    }

    // 5. Transition order to PRINTING (which updates print job to PRINTING and logs PRINT_STARTED)
    const updatedOrder = await OrderStateMachineService.transition({
      orderId: job.order.id,
      targetStatus: OrderStatus.PRINTING,
      userId: currentUser?.id,
      kioskId: job.kioskId,
      reason: 'Print job sent to physical printer queue',
      metadata: {
        jobId: job.id,
        hardwareResponse: adapterResponse,
      },
    });

    const updatedJob = await prisma.printJob.findUnique({
      where: { id: jobId },
    });

    return {
      job: updatedJob,
      order: updatedOrder,
      hardwareTelemetry: adapterResponse.telemetry,
      message: 'Print job started successfully',
    };
  }

  /**
   * Complete print job
   */
  static async completePrintJob(jobId: string, currentUser?: AuthUser) {
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: { order: true },
    });

    if (!job) {
      throw new NotFoundError(`Print job with ID '${jobId}' not found`);
    }

    this.authorizeJobAction(job, currentUser);

    if (job.status !== PrintJobStatus.PRINTING && job.order.status !== OrderStatus.PRINTING) {
      throw new ConflictError(
        `Cannot complete print job '${jobId}': Job must be in PRINTING status (current: ${job.status})`
      );
    }

    // Transition order to COMPLETED (which updates print job to COMPLETED and logs PRINT_COMPLETED)
    const updatedOrder = await OrderStateMachineService.transition({
      orderId: job.order.id,
      targetStatus: OrderStatus.COMPLETED,
      userId: currentUser?.id,
      kioskId: job.kioskId,
      reason: 'Physical print job completed successfully',
      metadata: {
        jobId: job.id,
        completedAt: new Date().toISOString(),
      },
    });

    const updatedJob = await prisma.printJob.findUnique({
      where: { id: jobId },
    });

    return {
      job: updatedJob,
      order: updatedOrder,
      message: 'Print job completed successfully',
    };
  }

  /**
   * Record print job failure
   */
  static async failPrintJob(jobId: string, errorMessage?: string, currentUser?: AuthUser) {
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: { order: true },
    });

    if (!job) {
      throw new NotFoundError(`Print job with ID '${jobId}' not found`);
    }

    this.authorizeJobAction(job, currentUser);

    if (job.status === PrintJobStatus.COMPLETED) {
      throw new ConflictError(`Cannot fail print job '${jobId}': Job is already COMPLETED`);
    }

    const failureReason = errorMessage || 'Printing failure at hardware level';

    // Transition order to PRINT_FAILED (which updates print job to FAILED and logs PRINT_FAILED)
    const updatedOrder = await OrderStateMachineService.transition({
      orderId: job.order.id,
      targetStatus: OrderStatus.PRINT_FAILED,
      userId: currentUser?.id,
      kioskId: job.kioskId,
      reason: failureReason,
      metadata: {
        jobId: job.id,
        errorMessage: failureReason,
      },
    });

    const updatedJob = await prisma.printJob.findUnique({
      where: { id: jobId },
    });

    return {
      job: updatedJob,
      order: updatedOrder,
      message: 'Print job marked as failed',
    };
  }

  /**
   * Get print job by ID
   */
  static async getPrintJobById(jobId: string, currentUser?: AuthUser) {
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        order: {
          include: { customer: true },
        },
        kiosk: true,
      },
    });

    if (!job) {
      throw new NotFoundError(`Print job with ID '${jobId}' not found`);
    }

    this.authorizeJobAction(job, currentUser);

    return job;
  }

  /**
   * List print jobs with pagination and filters
   */
  static async listPrintJobs(
    query: {
      page?: number;
      limit?: number;
      kioskId?: string;
      status?: PrintJobStatus;
    },
    currentUser?: AuthUser
  ) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (currentUser) {
      if (currentUser.role === 'KIOSK_OPERATOR') {
        where.kioskId = { in: currentUser.assignedKioskIds };
      } else if (currentUser.role === 'CUSTOMER') {
        where.order = { customerId: currentUser.customerId };
      }
    }

    if (query.kioskId && (!currentUser || currentUser.role === 'ADMIN')) {
      where.kioskId = query.kioskId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [jobs, total] = await Promise.all([
      prisma.printJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              customerId: true,
              status: true,
              paperSize: true,
              colorMode: true,
              copies: true,
              pageCount: true,
            },
          },
          kiosk: { select: { id: true, name: true, location: true } },
        },
      }),
      prisma.printJob.count({ where }),
    ]);

    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

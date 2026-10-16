import { PrintJobStatus, OrderStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ConflictError, ForbiddenError, UnauthorizedError } from '../../utils/errors';
import { OrderStateMachineService } from '../../services/state-machine.service';
import { MockPrinterAdapter } from '../../services/printer-adapter.service';
import { AuthUser } from '../../middleware/auth.middleware';
import { Logger } from '../../utils/logger';

export class PrintJobService {
  // In-memory mutex per job ID to prevent duplicate concurrent execution
  private static readonly activeJobLocks = new Set<string>();

  /**
   * Check if current user is authorized to VIEW a job
   */
  private static authorizeJobViewAction(
    job: { kioskId: string; order?: { customerId: string } | null },
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (currentUser.role === 'ADMIN') return;

    if (currentUser.role === 'KIOSK_OPERATOR') {
      if (!currentUser.assignedKioskIds.includes(job.kioskId)) {
        throw new ForbiddenError(`Kiosk operator is not authorized to access jobs for kiosk '${job.kioskId}'`);
      }
      return;
    }

    if (currentUser.role === 'CUSTOMER') {
      if (!job.order || job.order.customerId !== currentUser.customerId) {
        throw new ForbiddenError('Customers cannot access or view unauthorized print jobs');
      }
    }
  }

  /**
   * Check if current user is authorized to perform LIFECYCLE ACTION (start, complete, fail) on job
   */
  private static authorizeJobLifecycleAction(
    job: { kioskId: string; order?: { customerId: string } | null },
    currentUser?: AuthUser
  ) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (currentUser.role === 'ADMIN') return;

    if (currentUser.role === 'CUSTOMER') {
      throw new ForbiddenError('Customers are not authorized to start or manage print job execution');
    }

    if (currentUser.role === 'KIOSK_OPERATOR') {
      if (!currentUser.assignedKioskIds.includes(job.kioskId)) {
        throw new ForbiddenError(`Kiosk operator is not authorized to process jobs for kiosk '${job.kioskId}'`);
      }
      return;
    }
  }

  /**
   * Internal implementation of failing a print job (used directly or via adapter callback)
   */
  private static async failPrintJobInternal(jobId: string, errorMessage?: string, currentUser?: AuthUser) {
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: { order: true },
    });

    if (!job) {
      throw new NotFoundError(`Print job with ID '${jobId}' not found`);
    }

    this.authorizeJobLifecycleAction(job, currentUser);

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
      expectedVersion: job.order.version,
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
   * Start print job: Order must be PAID, Kiosk operator must be authorized
   * Protected against duplicate concurrent execution
   */
  static async startPrintJob(jobId: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    // 1. In-flight concurrency lock to prevent duplicate print job execution
    if (this.activeJobLocks.has(jobId)) {
      throw new ConflictError(`Print job '${jobId}' is currently being started by another process`);
    }

    this.activeJobLocks.add(jobId);
    try {
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

      // 2. Authorize operator / admin
      this.authorizeJobLifecycleAction(job, currentUser);

      // 3. Prevent duplicate execution or invalid state
      if (job.status === PrintJobStatus.PRINTING) {
        throw new ConflictError(`Print job '${jobId}' is already in PRINTING status`);
      }

      if (job.status === PrintJobStatus.COMPLETED) {
        throw new ConflictError(`Print job '${jobId}' is already completed`);
      }

      if (job.status === PrintJobStatus.FAILED || job.status === PrintJobStatus.CANCELLED) {
        throw new ConflictError(`Print job '${jobId}' cannot be started from '${job.status}' status`);
      }

      // 4. Rule: Job must not start until its order is PAID
      if (job.order.status !== OrderStatus.PAID) {
        throw new ConflictError(
          `Cannot start print job '${jobId}': Associated order status is '${job.order.status}', but must be 'PAID'.`
        );
      }

      // 5. Send to mock printer hardware adapter
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
        return await this.failPrintJobInternal(jobId, adapterResponse.message, currentUser);
      }

      // 6. Transition order to PRINTING with optimistic locking
      const updatedOrder = await OrderStateMachineService.transition({
        orderId: job.order.id,
        targetStatus: OrderStatus.PRINTING,
        userId: currentUser.id,
        kioskId: job.kioskId,
        reason: 'Print job sent to physical printer queue',
        metadata: {
          jobId: job.id,
          hardwareResponse: adapterResponse,
        },
        expectedVersion: job.order.version,
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
    } finally {
      this.activeJobLocks.delete(jobId);
    }
  }

  /**
   * Complete print job
   */
  static async completePrintJob(jobId: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (this.activeJobLocks.has(jobId)) {
      throw new ConflictError(`Print job '${jobId}' is currently being modified by another process`);
    }

    this.activeJobLocks.add(jobId);
    try {
      const job = await prisma.printJob.findUnique({
        where: { id: jobId },
        include: { order: true },
      });

      if (!job) {
        throw new NotFoundError(`Print job with ID '${jobId}' not found`);
      }

      this.authorizeJobLifecycleAction(job, currentUser);

      if (job.status !== PrintJobStatus.PRINTING && job.order.status !== OrderStatus.PRINTING) {
        throw new ConflictError(
          `Cannot complete print job '${jobId}': Job must be in PRINTING status (current: ${job.status})`
        );
      }

      // Transition order to COMPLETED with optimistic locking
      const updatedOrder = await OrderStateMachineService.transition({
        orderId: job.order.id,
        targetStatus: OrderStatus.COMPLETED,
        userId: currentUser.id,
        kioskId: job.kioskId,
        reason: 'Physical print job completed successfully',
        metadata: {
          jobId: job.id,
          completedAt: new Date().toISOString(),
        },
        expectedVersion: job.order.version,
      });

      const updatedJob = await prisma.printJob.findUnique({
        where: { id: jobId },
      });

      return {
        job: updatedJob,
        order: updatedOrder,
        message: 'Print job completed successfully',
      };
    } finally {
      this.activeJobLocks.delete(jobId);
    }
  }

  /**
   * Record print job failure
   */
  static async failPrintJob(jobId: string, errorMessage?: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (this.activeJobLocks.has(jobId)) {
      throw new ConflictError(`Print job '${jobId}' is currently being modified by another process`);
    }

    this.activeJobLocks.add(jobId);
    try {
      return await this.failPrintJobInternal(jobId, errorMessage, currentUser);
    } finally {
      this.activeJobLocks.delete(jobId);
    }
  }

  /**
   * Get print job by ID
   */
  static async getPrintJobById(jobId: string, currentUser?: AuthUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

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

    this.authorizeJobViewAction(job, currentUser);

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
    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (currentUser.role === 'KIOSK_OPERATOR') {
      where.kioskId = { in: currentUser.assignedKioskIds };
    } else if (currentUser.role === 'CUSTOMER') {
      where.order = { customerId: currentUser.customerId };
    }

    if (query.kioskId && currentUser.role === 'ADMIN') {
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

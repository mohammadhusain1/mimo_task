import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

/**
 * List audit logs (Strictly Admin only)
 */
router.get(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const orderId = req.query.orderId as string | undefined;
      const event = req.query.event as any;

      const where: any = {};
      if (orderId) where.orderId = orderId;
      if (event) where.event = event;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { timestamp: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            kiosk: { select: { id: true, name: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      sendSuccess(res, logs, 'Audit logs retrieved', 200, {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

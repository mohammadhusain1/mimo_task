import { Router } from 'express';
import { PrintJobController } from './print-job.controller';
import { validate } from '../../middleware/validate.middleware';
import { getPrintJobsQuerySchema, failPrintJobSchema } from './print-job.schema';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// List print jobs: accessible by authenticated users (scoped by role in service)
router.get(
  '/',
  authenticate,
  validate(getPrintJobsQuerySchema),
  PrintJobController.listPrintJobs
);

// Get print job details: accessible by authenticated users (authorized by role/ownership in service)
router.get(
  '/:jobId',
  authenticate,
  PrintJobController.getPrintJobById
);

// Hardware print job execution routes: strictly ADMIN or KIOSK_OPERATOR
router.post(
  '/:jobId/start',
  authenticate,
  requireRole(Role.ADMIN, Role.KIOSK_OPERATOR),
  PrintJobController.startPrintJob
);

router.post(
  '/:jobId/complete',
  authenticate,
  requireRole(Role.ADMIN, Role.KIOSK_OPERATOR),
  PrintJobController.completePrintJob
);

router.post(
  '/:jobId/fail',
  authenticate,
  requireRole(Role.ADMIN, Role.KIOSK_OPERATOR),
  validate(failPrintJobSchema),
  PrintJobController.failPrintJob
);

export default router;

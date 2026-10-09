import { Router } from 'express';
import { PrintJobController } from './print-job.controller';
import { validate } from '../../middleware/validate.middleware';
import { getPrintJobsQuerySchema, failPrintJobSchema } from './print-job.schema';
import { optionalAuthenticate } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', optionalAuthenticate, validate(getPrintJobsQuerySchema), PrintJobController.listPrintJobs);
router.get('/:jobId', optionalAuthenticate, PrintJobController.getPrintJobById);
router.post('/:jobId/start', optionalAuthenticate, PrintJobController.startPrintJob);
router.post('/:jobId/complete', optionalAuthenticate, PrintJobController.completePrintJob);
router.post('/:jobId/fail', optionalAuthenticate, validate(failPrintJobSchema), PrintJobController.failPrintJob);

export default router;

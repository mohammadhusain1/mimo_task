import { Request, Response, NextFunction } from 'express';
import { PrintJobService } from './print-job.service';
import { sendSuccess } from '../../utils/response';

export class PrintJobController {
  static async listPrintJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PrintJobService.listPrintJobs(req.query as any, req.user);
      sendSuccess(res, result.jobs, 'Print jobs retrieved successfully', 200, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  static async getPrintJobById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await PrintJobService.getPrintJobById(req.params.jobId, req.user);
      sendSuccess(res, job, 'Print job retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async startPrintJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PrintJobService.startPrintJob(req.params.jobId, req.user);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async completePrintJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PrintJobService.completePrintJob(req.params.jobId, req.user);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async failPrintJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errorMessage = req.body?.errorMessage;
      const result = await PrintJobService.failPrintJob(req.params.jobId, errorMessage, req.user);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }
}

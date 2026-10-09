import { z } from 'zod';
import { PrintJobStatus } from '@prisma/client';

export const getPrintJobsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    kioskId: z.string().optional(),
    status: z.nativeEnum(PrintJobStatus).optional(),
  }),
});

export const failPrintJobSchema = z.object({
  params: z.object({
    jobId: z.string().min(1, 'Job ID is required'),
  }),
  body: z.object({
    errorMessage: z.string().optional().default('Hardware error encountered during printing'),
  }).optional(),
});

import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  params: z.object({
    orderId: z.string().min(1, 'Order ID is required'),
  }),
  body: z.object({
    idempotencyKey: z.string().optional(),
    provider: z.string().optional().default('SIMULATED'),
  }).optional(),
});

export const simulatePaymentResultSchema = z.object({
  params: z.object({
    paymentId: z.string().min(1, 'Payment ID is required'),
  }),
  body: z.object({
    reason: z.string().optional(),
    transactionRef: z.string().optional(),
  }).optional(),
});

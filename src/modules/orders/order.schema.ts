import { z } from 'zod';
import { PaperSize, ColorMode, OrderStatus } from '@prisma/client';

export const createOrderSchema = z.object({
  body: z.object({
    customerId: z.string().min(1, 'Customer ID is required'),
    kioskId: z.string().min(1, 'Kiosk ID is required'),
    fileUrl: z.string().url('File URL must be a valid URL'),
    copies: z.number().int().positive('Copies must be an integer greater than 0'),
    paperSize: z.nativeEnum(PaperSize, {
      errorMap: () => ({ message: 'Paper size must be A4, A3, or A5' }),
    }),
    colorMode: z.nativeEnum(ColorMode, {
      errorMap: () => ({ message: 'Color mode must be BW or COLOR' }),
    }),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({
    orderId: z.string().min(1, 'Order ID is required'),
  }),
  body: z.object({
    status: z.nativeEnum(OrderStatus, {
      errorMap: () => ({ message: 'Invalid target order status' }),
    }),
    reason: z.string().optional(),
    expectedVersion: z.number().int().optional(),
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({
    orderId: z.string().min(1, 'Order ID is required'),
  }),
  body: z.object({
    reason: z.string().optional(),
  }).optional(),
});

export const getOrdersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    customerId: z.string().optional(),
    kioskId: z.string().optional(),
    status: z.nativeEnum(OrderStatus).optional(),
  }),
});

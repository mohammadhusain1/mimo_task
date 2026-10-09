import { Request, Response, NextFunction } from 'express';
import { PaymentService } from './payment.service';
import { sendSuccess } from '../../utils/response';

export class PaymentController {
  static async initiatePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
      const provider = req.body?.provider;
      const result = await PaymentService.initiatePayment(
        req.params.orderId,
        { idempotencyKey, provider },
        req.user
      );
      sendSuccess(res, result, 'Payment initiated', 201);
    } catch (error) {
      next(error);
    }
  }

  static async paymentSuccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PaymentService.handlePaymentSuccess(
        req.params.paymentId,
        req.body,
        req.user
      );
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async paymentFailure(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PaymentService.handlePaymentFailure(
        req.params.paymentId,
        req.body,
        req.user
      );
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }
}

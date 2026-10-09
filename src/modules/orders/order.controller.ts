import { Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service';
import { sendSuccess } from '../../utils/response';

export class OrderController {
  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await OrderService.createOrder(req.body, req.user);
      sendSuccess(res, order, 'Order created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await OrderService.getOrderById(req.params.orderId, req.user);
      sendSuccess(res, order, 'Order retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await OrderService.listOrders(req.query as any, req.user);
      sendSuccess(res, result.orders, 'Orders retrieved successfully', 200, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  static async transitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, reason, expectedVersion } = req.body;
      const order = await OrderService.transitionStatus(
        req.params.orderId,
        status,
        reason,
        expectedVersion,
        req.user
      );
      sendSuccess(res, order, `Order status updated to ${status}`);
    } catch (error) {
      next(error);
    }
  }

  static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reason = req.body?.reason;
      const order = await OrderService.cancelOrder(req.params.orderId, reason, req.user);
      sendSuccess(res, order, 'Order cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getOrderAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const logs = await OrderService.getOrderAuditLogs(req.params.orderId, req.user);
      sendSuccess(res, logs, 'Order audit logs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

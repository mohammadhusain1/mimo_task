import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { Logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response {
  Logger.error(`Exception caught in centralized error handler: ${err.message}`, err);

  // Handle known AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.name,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Handle Prisma unique constraint error (P2002)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      return res.status(409).json({
        success: false,
        error: {
          code: 'ConflictError',
          message: `Unique constraint violation on ${target}`,
          details: err.meta,
        },
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NotFoundError',
          message: 'Requested record not found in database',
          details: err.meta,
        },
      });
    }
  }

  // Handle JSON parsing errors in body
  if ('type' in err && (err as any).type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BadRequestError',
        message: 'Malformed JSON payload in request body',
      },
    });
  }

  // Fallback for unhandled internal server errors
  const statusCode = 500;
  const isProduction = process.env.NODE_ENV === 'production';

  return res.status(statusCode).json({
    success: false,
    error: {
      code: 'InternalServerError',
      message: isProduction ? 'An unexpected internal error occurred' : err.message,
      ...(!isProduction && err.stack ? { stack: err.stack } : {}),
    },
  });
}

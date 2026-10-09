import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  customerId?: string | null;
  assignedKioskIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function generateToken(user: { id: string; email: string; role: Role; customerId?: string | null }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId || null,
    },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token missing or invalid'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      role: Role;
      customerId?: string | null;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        customer: true,
        kiosks: true,
      },
    });

    if (!user) {
      return next(new UnauthorizedError('User account not found'));
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customer?.id || null,
      assignedKioskIds: (user.kiosks || []).map((k) => k.id),
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Authentication token has expired'));
    }
    return next(new UnauthorizedError('Invalid authentication token'));
  }
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      role: Role;
      customerId?: string | null;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        customer: true,
        kiosks: true,
      },
    });

    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        customerId: user.customer?.id || null,
        assignedKioskIds: (user.kiosks || []).map((k) => k.id),
      };
    }
  } catch {
    // Ignore invalid optional token or let authenticate catch if strictly required
  }

  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access forbidden: Requires one of [${roles.join(', ')}] role(s)`
        )
      );
    }

    next();
  };
}

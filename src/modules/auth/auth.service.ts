import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { generateToken } from '../../middleware/auth.middleware';

export class AuthService {
  static async register(data: {
    email: string;
    password: string;
    name: string;
    role?: Role;
    customerId?: string;
    phone?: string;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const role = data.role || Role.CUSTOMER;

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          name: data.name,
          role,
        },
      });

      let customerRecord = null;
      if (role === Role.CUSTOMER) {
        const custId = data.customerId || `CUS-${Date.now().toString().slice(-6)}`;
        customerRecord = await tx.customer.create({
          data: {
            id: custId,
            userId: user.id,
            name: data.name,
            email: data.email,
            phone: data.phone || null,
            isActive: true,
          },
        });
      }

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: customerRecord?.id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          customerId: customerRecord?.id || null,
        },
        token,
      };
    });
  }

  static async login(credentials: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
      include: {
        customer: true,
        kiosks: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customer?.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        customerId: user.customer?.id || null,
        assignedKiosks: user.kiosks.map((k) => k.id),
      },
      token,
    };
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: true,
        kiosks: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customer?.id || null,
      assignedKiosks: user.kiosks.map((k) => k.id),
      createdAt: user.createdAt,
    };
  }
}

import { Role, KioskStatus, PaperSize, ColorMode, OrderStatus, PrintJobStatus, PaymentStatus, AuditEventType } from '@prisma/client';
import bcrypt from 'bcryptjs';

export function createMockDatabase() {
  const users = new Map<string, any>();
  const customers = new Map<string, any>();
  const kiosks = new Map<string, any>();
  const orders = new Map<string, any>();
  const printJobs = new Map<string, any>();
  const payments = new Map<string, any>();
  const auditLogs: any[] = [];
  const pricingRules = new Map<string, any>();

  // Reset and seed helper
  const seed = () => {
    users.clear();
    customers.clear();
    kiosks.clear();
    orders.clear();
    printJobs.clear();
    payments.clear();
    auditLogs.length = 0;
    pricingRules.clear();

    const adminHash = bcrypt.hashSync('Admin@123', 4);
    const customerHash = bcrypt.hashSync('Customer@123', 4);
    const operatorHash = bcrypt.hashSync('Operator@123', 4);

    // Users
    users.set('admin-1', {
      id: 'admin-1',
      email: 'admin@smartprint.com',
      passwordHash: adminHash,
      name: 'System Administrator',
      role: Role.ADMIN,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    users.set('cust-user-1', {
      id: 'cust-user-1',
      email: 'customer1@example.com',
      passwordHash: customerHash,
      name: 'John Doe',
      role: Role.CUSTOMER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    users.set('cust-user-2', {
      id: 'cust-user-2',
      email: 'customer2@example.com',
      passwordHash: customerHash,
      name: 'Jane Smith',
      role: Role.CUSTOMER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    users.set('op-user-1', {
      id: 'op-user-1',
      email: 'operator1@smartprint.com',
      passwordHash: operatorHash,
      name: 'Alice Operator',
      role: Role.KIOSK_OPERATOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    users.set('op-user-2', {
      id: 'op-user-2',
      email: 'operator2@smartprint.com',
      passwordHash: operatorHash,
      name: 'Bob Operator',
      role: Role.KIOSK_OPERATOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Customers
    customers.set('CUS001', {
      id: 'CUS001',
      userId: 'cust-user-1',
      name: 'John Doe',
      email: 'customer1@example.com',
      phone: '+1-555-0101',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    customers.set('CUS002', {
      id: 'CUS002',
      userId: 'cust-user-2',
      name: 'Jane Smith',
      email: 'customer2@example.com',
      phone: '+1-555-0102',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    customers.set('CUS_INACTIVE', {
      id: 'CUS_INACTIVE',
      userId: 'cust-user-1',
      name: 'Inactive Customer',
      email: 'inactive@example.com',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Kiosks
    kiosks.set('KIOSK001', {
      id: 'KIOSK001',
      name: 'Central Library Kiosk',
      location: 'Building A, Floor 1',
      status: KioskStatus.ACTIVE,
      operatorId: 'op-user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    kiosks.set('KIOSK002', {
      id: 'KIOSK002',
      name: 'Student Union Kiosk',
      location: 'Building B, Ground Floor',
      status: KioskStatus.ACTIVE,
      operatorId: 'op-user-2',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    kiosks.set('KIOSK003', {
      id: 'KIOSK003',
      name: 'Dormitory Kiosk',
      location: 'Hall C, Lobby',
      status: KioskStatus.MAINTENANCE,
      operatorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Pricing Rules
    const rules = [
      { paperSize: PaperSize.A4, colorMode: ColorMode.BW, pricePerPage: 10 },
      { paperSize: PaperSize.A4, colorMode: ColorMode.COLOR, pricePerPage: 50 },
      { paperSize: PaperSize.A3, colorMode: ColorMode.BW, pricePerPage: 25 },
      { paperSize: PaperSize.A3, colorMode: ColorMode.COLOR, pricePerPage: 100 },
      { paperSize: PaperSize.A5, colorMode: ColorMode.BW, pricePerPage: 8 },
      { paperSize: PaperSize.A5, colorMode: ColorMode.COLOR, pricePerPage: 40 },
    ];

    for (const r of rules) {
      const key = `${r.paperSize}_${r.colorMode}`;
      pricingRules.set(key, {
        id: `rule-${key}`,
        paperSize: r.paperSize,
        colorMode: r.colorMode,
        pricePerPage: r.pricePerPage,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  };

  seed();

  const mockClient = {
    $reset: seed,
    user: {
      findUnique: async ({ where }: any) => {
        let found = null;
        if (where.id) {
          found = users.get(where.id);
        } else if (where.email) {
          for (const u of users.values()) {
            if (u.email === where.email) {
              found = u;
              break;
            }
          }
        }
        if (!found) return null;
        const cust = Array.from(customers.values()).find(c => c.userId === found.id);
        const opKiosks = Array.from(kiosks.values()).filter(k => k.operatorId === found.id);
        return { ...found, customer: cust || null, kiosks: opKiosks || [] };
      },
      create: async ({ data }: any) => {
        const id = data.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const user = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        users.set(id, user);
        return user;
      },
    },
    customer: {
      findUnique: async ({ where }: any) => {
        if (where.id) return customers.get(where.id) || null;
        if (where.userId) {
          for (const c of customers.values()) {
            if (c.userId === where.userId) return c;
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = data.id || `CUS-${Date.now().toString().slice(-4)}`;
        const customer = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        customers.set(id, customer);
        return customer;
      },
    },
    kiosk: {
      findUnique: async ({ where }: any) => {
        const kiosk = kiosks.get(where.id);
        if (!kiosk) return null;
        const op = kiosk.operatorId ? users.get(kiosk.operatorId) : null;
        return { ...kiosk, operator: op };
      },
      findMany: async () => Array.from(kiosks.values()),
    },
    pricingRule: {
      findUnique: async ({ where }: any) => {
        if (where.paperSize_colorMode) {
          const key = `${where.paperSize_colorMode.paperSize}_${where.paperSize_colorMode.colorMode}`;
          return pricingRules.get(key) || null;
        }
        return null;
      },
      findMany: async () => Array.from(pricingRules.values()),
    },
    order: {
      create: async ({ data }: any) => {
        const order = {
          ...data,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        orders.set(order.id, order);
        return order;
      },
      findUnique: async ({ where, include }: any) => {
        const order = orders.get(where.id);
        if (!order) return null;
        const job = Array.from(printJobs.values()).find(j => j.orderId === order.id);
        const orderPayments = Array.from(payments.values()).filter(p => p.orderId === order.id);
        const cust = customers.get(order.customerId);
        const k = kiosks.get(order.kioskId);

        return {
          ...order,
          printJob: job || null,
          payments: orderPayments,
          customer: cust,
          kiosk: k,
        };
      },
      findMany: async ({ where }: any = {}) => {
        let list = Array.from(orders.values());
        if (where?.customerId) list = list.filter(o => o.customerId === where.customerId);
        if (where?.kioskId) {
          if (Array.isArray(where.kioskId?.in)) {
            list = list.filter(o => where.kioskId.in.includes(o.kioskId));
          } else {
            list = list.filter(o => o.kioskId === where.kioskId);
          }
        }
        if (where?.status) list = list.filter(o => o.status === where.status);
        return list.map(order => ({
          ...order,
          printJob: Array.from(printJobs.values()).find(j => j.orderId === order.id) || null,
          customer: customers.get(order.customerId),
          kiosk: kiosks.get(order.kioskId),
        }));
      },
      count: async ({ where }: any = {}) => {
        const list = await mockClient.order.findMany({ where });
        return list.length;
      },
      update: async ({ where, data }: any) => {
        const order = orders.get(where.id);
        if (!order) throw new Error('Order not found');

        // Optimistic concurrency check
        if (where.version !== undefined && order.version !== where.version) {
          throw new Error('Concurrent modification conflict on version check');
        }

        const newVersion = data.version?.increment ? order.version + 1 : (data.version || order.version);
        const updated = {
          ...order,
          ...data,
          version: newVersion,
          updatedAt: new Date(),
        };
        orders.set(where.id, updated);
        return {
          ...updated,
          printJob: Array.from(printJobs.values()).find(j => j.orderId === updated.id) || null,
          customer: customers.get(updated.customerId),
          kiosk: kiosks.get(updated.kioskId),
        };
      },
    },
    printJob: {
      create: async ({ data }: any) => {
        const job = {
          ...data,
          attempts: data.attempts || 0,
          createdAt: new Date(),
        };
        printJobs.set(job.id, job);
        return job;
      },
      findUnique: async ({ where }: any) => {
        const job = printJobs.get(where.id || where.orderId);
        if (!job) {
          // If queried by orderId
          for (const j of printJobs.values()) {
            if (j.orderId === where.orderId) {
              const order = orders.get(j.orderId);
              return { ...j, order, kiosk: kiosks.get(j.kioskId) };
            }
          }
          return null;
        }
        const order = orders.get(job.orderId);
        return { ...job, order, kiosk: kiosks.get(job.kioskId) };
      },
      findMany: async ({ where }: any = {}) => {
        let list = Array.from(printJobs.values());
        if (where?.kioskId) {
          if (Array.isArray(where.kioskId?.in)) {
            list = list.filter(j => where.kioskId.in.includes(j.kioskId));
          } else {
            list = list.filter(j => j.kioskId === where.kioskId);
          }
        }
        if (where?.status) list = list.filter(j => j.status === where.status);
        return list.map(job => ({
          ...job,
          order: orders.get(job.orderId),
          kiosk: kiosks.get(job.kioskId),
        }));
      },
      count: async () => printJobs.size,
      update: async ({ where, data }: any) => {
        const job = printJobs.get(where.id);
        if (!job) throw new Error('PrintJob not found');
        const attempts = data.attempts?.increment ? job.attempts + 1 : (data.attempts ?? job.attempts);
        const updated = { ...job, ...data, attempts };
        printJobs.set(where.id, updated);
        return updated;
      },
    },
    payment: {
      create: async ({ data }: any) => {
        const payment = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        payments.set(payment.id, payment);
        return payment;
      },
      findUnique: async ({ where }: any) => {
        if (where.id) {
          const p = payments.get(where.id);
          return p ? { ...p, order: orders.get(p.orderId) } : null;
        }
        if (where.idempotencyKey) {
          for (const p of payments.values()) {
            if (p.idempotencyKey === where.idempotencyKey) {
              return { ...p, order: orders.get(p.orderId) };
            }
          }
        }
        if (where.transactionRef) {
          for (const p of payments.values()) {
            if (p.transactionRef === where.transactionRef) return p;
          }
        }
        return null;
      },
      findMany: async ({ where }: any = {}) => {
        let list = Array.from(payments.values());
        if (where?.orderId) list = list.filter(p => p.orderId === where.orderId);
        return list;
      },
      update: async ({ where, data }: any) => {
        const p = payments.get(where.id);
        if (!p) throw new Error('Payment not found');
        const updated = { ...p, ...data, updatedAt: new Date() };
        payments.set(where.id, updated);
        return updated;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const id = data.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const log = { ...data, id, timestamp: new Date() };
        auditLogs.push(log);
        return log;
      },
      findMany: async ({ where }: any = {}) => {
        let list = [...auditLogs];
        if (where?.orderId) list = list.filter(l => l.orderId === where.orderId);
        if (where?.event) list = list.filter(l => l.event === where.event);
        return list;
      },
      count: async () => auditLogs.length,
    },
    $transaction: async (fnOrArray: any) => {
      if (typeof fnOrArray === 'function') {
        return await fnOrArray(mockClient);
      }
      return Promise.all(fnOrArray);
    },
    $queryRaw: async () => [{ 1: 1 }],
    $disconnect: async () => {},
  };

  return mockClient;
}

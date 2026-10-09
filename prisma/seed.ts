import { PrismaClient, Role, KioskStatus, PaperSize, ColorMode } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seedDatabase(client: PrismaClient = prisma) {
  console.log('Seeding database...');

  // Hash passwords
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const customerPassword = await bcrypt.hash('Customer@123', 10);
  const operatorPassword = await bcrypt.hash('Operator@123', 10);

  // 1. Create Users
  const adminUser = await client.user.upsert({
    where: { email: 'admin@smartprint.com' },
    update: {},
    create: {
      email: 'admin@smartprint.com',
      passwordHash: adminPassword,
      name: 'System Administrator',
      role: Role.ADMIN,
    },
  });

  const customerUser1 = await client.user.upsert({
    where: { email: 'customer1@example.com' },
    update: {},
    create: {
      email: 'customer1@example.com',
      passwordHash: customerPassword,
      name: 'John Doe',
      role: Role.CUSTOMER,
    },
  });

  const customerUser2 = await client.user.upsert({
    where: { email: 'customer2@example.com' },
    update: {},
    create: {
      email: 'customer2@example.com',
      passwordHash: customerPassword,
      name: 'Jane Smith',
      role: Role.CUSTOMER,
    },
  });

  const operatorUser1 = await client.user.upsert({
    where: { email: 'operator1@smartprint.com' },
    update: {},
    create: {
      email: 'operator1@smartprint.com',
      passwordHash: operatorPassword,
      name: 'Alice Operator',
      role: Role.KIOSK_OPERATOR,
    },
  });

  const operatorUser2 = await client.user.upsert({
    where: { email: 'operator2@smartprint.com' },
    update: {},
    create: {
      email: 'operator2@smartprint.com',
      passwordHash: operatorPassword,
      name: 'Bob Operator',
      role: Role.KIOSK_OPERATOR,
    },
  });

  // 2. Create Customers
  await client.customer.upsert({
    where: { id: 'CUS001' },
    update: { isActive: true },
    create: {
      id: 'CUS001',
      userId: customerUser1.id,
      name: 'John Doe',
      email: 'customer1@example.com',
      phone: '+1-555-0101',
      isActive: true,
    },
  });

  await client.customer.upsert({
    where: { id: 'CUS002' },
    update: { isActive: true },
    create: {
      id: 'CUS002',
      userId: customerUser2.id,
      name: 'Jane Smith',
      email: 'customer2@example.com',
      phone: '+1-555-0102',
      isActive: true,
    },
  });

  // 3. Create Kiosks
  await client.kiosk.upsert({
    where: { id: 'KIOSK001' },
    update: { status: KioskStatus.ACTIVE, operatorId: operatorUser1.id },
    create: {
      id: 'KIOSK001',
      name: 'Central Library Kiosk',
      location: 'Building A, Floor 1',
      status: KioskStatus.ACTIVE,
      operatorId: operatorUser1.id,
    },
  });

  await client.kiosk.upsert({
    where: { id: 'KIOSK002' },
    update: { status: KioskStatus.ACTIVE, operatorId: operatorUser2.id },
    create: {
      id: 'KIOSK002',
      name: 'Student Union Kiosk',
      location: 'Building B, Ground Floor',
      status: KioskStatus.ACTIVE,
      operatorId: operatorUser2.id,
    },
  });

  await client.kiosk.upsert({
    where: { id: 'KIOSK003' },
    update: { status: KioskStatus.MAINTENANCE, operatorId: null },
    create: {
      id: 'KIOSK003',
      name: 'Dormitory Kiosk (Maintenance)',
      location: 'Hall C, Lobby',
      status: KioskStatus.MAINTENANCE,
      operatorId: null,
    },
  });

  // 4. Create Pricing Rules (in cents)
  const pricingMatrix: Array<{ paperSize: PaperSize; colorMode: ColorMode; pricePerPage: number }> = [
    { paperSize: PaperSize.A4, colorMode: ColorMode.BW, pricePerPage: 10 },    // $0.10
    { paperSize: PaperSize.A4, colorMode: ColorMode.COLOR, pricePerPage: 50 }, // $0.50
    { paperSize: PaperSize.A3, colorMode: ColorMode.BW, pricePerPage: 25 },    // $0.25
    { paperSize: PaperSize.A3, colorMode: ColorMode.COLOR, pricePerPage: 100 },// $1.00
    { paperSize: PaperSize.A5, colorMode: ColorMode.BW, pricePerPage: 8 },     // $0.08
    { paperSize: PaperSize.A5, colorMode: ColorMode.COLOR, pricePerPage: 40 }, // $0.40
  ];

  for (const rule of pricingMatrix) {
    await client.pricingRule.upsert({
      where: {
        paperSize_colorMode: {
          paperSize: rule.paperSize,
          colorMode: rule.colorMode,
        },
      },
      update: { pricePerPage: rule.pricePerPage, isActive: true },
      create: {
        paperSize: rule.paperSize,
        colorMode: rule.colorMode,
        pricePerPage: rule.pricePerPage,
        isActive: true,
      },
    });
  }

  console.log('Database seeded successfully!');
}

async function main() {
  try {
    await seedDatabase();
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

import request from 'supertest';
import { createMockDatabase } from './mock-db';

// Create mock database instance
const mockDb = createMockDatabase();

// Mock prisma in database.ts
jest.mock('../src/config/database', () => ({
  prisma: mockDb,
  checkDatabaseConnection: jest.fn().mockResolvedValue(true),
}));

import { createApp } from '../src/app';

const app = createApp();

describe('Smart Print Order & Job Management System', () => {
  beforeEach(() => {
    mockDb.$reset();
  });

  // ==========================================
  // Test 1: Successful order creation
  // ==========================================
  it('1. should successfully create an order with valid input', async () => {
    const payload = {
      customerId: 'CUS001',
      kioskId: 'KIOSK001',
      fileUrl: 'https://example.com/document.pdf',
      copies: 3,
      paperSize: 'A4',
      colorMode: 'BW',
    };

    const res = await request(app)
      .post('/api/orders')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBeDefined();
    expect(res.body.data.status).toBe('CREATED');
    expect(res.body.data.customerId).toBe('CUS001');
    expect(res.body.data.kioskId).toBe('KIOSK001');
    expect(res.body.data.pricing).toBeDefined();
    expect(res.body.data.printJob).toBeDefined();
    expect(res.body.data.printJob.status).toBe('QUEUED');
  });

  // ==========================================
  // Test 2: Invalid order input
  // ==========================================
  it('2. should reject order with missing or malformed fields (400)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: '',
        kioskId: 'KIOSK001',
        fileUrl: 'not-a-valid-url',
        copies: -1,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ==========================================
  // Test 3: Missing customer or kiosk
  // ==========================================
  it('3. should return 404 when customer or kiosk does not exist', async () => {
    const resMissingCustomer = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'NON_EXISTENT_CUST',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    expect(resMissingCustomer.status).toBe(404);

    const resMissingKiosk = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'NON_EXISTENT_KIOSK',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    expect(resMissingKiosk.status).toBe(404);
  });

  // ==========================================
  // Test 4: Invalid or unsupported paper size
  // ==========================================
  it('4. should reject unsupported paper sizes with 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'LETTER', // Unsupported (only A4, A3, A5)
        colorMode: 'BW',
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // Test 5: Invalid copy count
  // ==========================================
  it('5. should reject zero or negative copy count', async () => {
    const resZero = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 0,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    expect(resZero.status).toBe(400);

    const resNegative = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: -5,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    expect(resNegative.status).toBe(400);
  });

  // ==========================================
  // Test 6: Price calculation
  // ==========================================
  it('6. should correctly calculate price without trusting client values', async () => {
    // 3 copies of a 5-page doc (using ?pages=5) in A4 COLOR (50 cents/page)
    // Total pages = 15. Total price = 15 * 50 = 750 cents ($7.50)
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/document.pdf?pages=5',
        copies: 3,
        paperSize: 'A4',
        colorMode: 'COLOR',
        clientProvidedPrice: 10, // Ignored!
      });

    expect(res.status).toBe(201);
    expect(res.body.data.pricing.basePricePerPageCents).toBe(50);
    expect(res.body.data.pricing.totalPriceCents).toBe(750);
    expect(res.body.data.pricing.formattedTotalPrice).toBe('$7.50');
  });

  // ==========================================
  // Test 7: Automatic print-job creation
  // ==========================================
  it('7. should automatically create linked print job in QUEUED status', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/document.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });

    expect(res.status).toBe(201);
    const orderId = res.body.data.orderId;
    const printJobId = res.body.data.printJob.id;

    // Verify print job via print-jobs API
    const jobRes = await request(app).get(`/api/print-jobs/${printJobId}`);
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.data.orderId).toBe(orderId);
    expect(jobRes.body.data.status).toBe('QUEUED');
  });

  // ==========================================
  // Test 8: Successful payment
  // ==========================================
  it('8. should transition order to PAID after successful payment simulation', async () => {
    // 1. Create order
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    // 2. Initiate payment
    const payRes = await request(app)
      .post(`/api/orders/${orderId}/payment`)
      .send();
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.data.payment.id;

    // Check order entered PAYMENT_PENDING
    const pendingOrder = await request(app).get(`/api/orders/${orderId}`);
    expect(pendingOrder.body.data.status).toBe('PAYMENT_PENDING');

    // 3. Mark payment successful
    const successRes = await request(app)
      .post(`/api/payments/${paymentId}/success`)
      .send();
    expect(successRes.status).toBe(200);

    // Verify order is now PAID
    const paidOrder = await request(app).get(`/api/orders/${orderId}`);
    expect(paidOrder.body.data.status).toBe('PAID');
  });

  // ==========================================
  // Test 9: Failed payment
  // ==========================================
  it('9. should transition order to PAYMENT_FAILED after failed payment simulation', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    const payRes = await request(app).post(`/api/orders/${orderId}/payment`).send();
    const paymentId = payRes.body.data.payment.id;

    // Mark payment failed
    const failRes = await request(app)
      .post(`/api/payments/${paymentId}/failure`)
      .send({ reason: 'Card declined by issuing bank' });
    expect(failRes.status).toBe(200);

    // Verify order is PAYMENT_FAILED
    const failedOrder = await request(app).get(`/api/orders/${orderId}`);
    expect(failedOrder.body.data.status).toBe('PAYMENT_FAILED');
  });

  // ==========================================
  // Test 10: Printing before payment
  // ==========================================
  it('10. should reject starting print job before order is PAID (409 Conflict)', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const jobId = orderRes.body.data.printJob.id;

    // Order is in CREATED status (not PAID)
    const startRes = await request(app).post(`/api/print-jobs/${jobId}/start`).send();
    expect(startRes.status).toBe(409);
    expect(startRes.body.error.message).toMatch(/must be.*PAID/i);
  });

  // ==========================================
  // Test 11: Successful printing and completion
  // ==========================================
  it('11. should transition job and order to COMPLETED upon successful print finish', async () => {
    // Create, pay, start, complete
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;
    const jobId = orderRes.body.data.printJob.id;

    // Pay
    const payRes = await request(app).post(`/api/orders/${orderId}/payment`).send();
    await request(app).post(`/api/payments/${payRes.body.data.payment.id}/success`).send();

    // Start printing
    const startRes = await request(app).post(`/api/print-jobs/${jobId}/start`).send();
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.job.status).toBe('PRINTING');
    expect(startRes.body.data.order.status).toBe('PRINTING');

    // Complete printing
    const completeRes = await request(app).post(`/api/print-jobs/${jobId}/complete`).send();
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.job.status).toBe('COMPLETED');
    expect(completeRes.body.data.order.status).toBe('COMPLETED');
  });

  // ==========================================
  // Test 12: Print failure
  // ==========================================
  it('12. should record FAILED job and PRINT_FAILED order when print fails', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;
    const jobId = orderRes.body.data.printJob.id;

    const payRes = await request(app).post(`/api/orders/${orderId}/payment`).send();
    await request(app).post(`/api/payments/${payRes.body.data.payment.id}/success`).send();
    await request(app).post(`/api/print-jobs/${jobId}/start`).send();

    // Fail print job
    const failRes = await request(app)
      .post(`/api/print-jobs/${jobId}/fail`)
      .send({ errorMessage: 'Mechanical cutter jam' });

    expect(failRes.status).toBe(200);
    expect(failRes.body.data.job.status).toBe('FAILED');
    expect(failRes.body.data.order.status).toBe('PRINT_FAILED');
  });

  // ==========================================
  // Test 13: Invalid state transitions
  // ==========================================
  it('13. should reject invalid state transitions with 409 Conflict', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    // Try transitioning CREATED directly to COMPLETED (invalid)
    const invalidRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'COMPLETED' });

    expect(invalidRes.status).toBe(409);
    expect(invalidRes.body.error.code).toBe('ConflictError');
  });

  // ==========================================
  // Test 14: Cancellation rules
  // ==========================================
  it('14. should permit cancellation before printing and reject after printing starts', async () => {
    // Cancellation when CREATED
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId1 = orderRes.body.data.orderId;

    const cancelRes = await request(app).post(`/api/orders/${orderId1}/cancel`).send();
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // Create another order, advance to PRINTING, try cancelling
    const orderRes2 = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId2 = orderRes2.body.data.orderId;
    const jobId2 = orderRes2.body.data.printJob.id;

    const payRes = await request(app).post(`/api/orders/${orderId2}/payment`).send();
    await request(app).post(`/api/payments/${payRes.body.data.payment.id}/success`).send();
    await request(app).post(`/api/print-jobs/${jobId2}/start`).send();

    // Now order is PRINTING - cancellation must be rejected!
    const rejectCancel = await request(app).post(`/api/orders/${orderId2}/cancel`).send();
    expect(rejectCancel.status).toBe(409);
  });

  // ==========================================
  // Test 15: Duplicate payment requests (Idempotency)
  // ==========================================
  it('15. should handle duplicate payment requests idempotently', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    // Send first payment initiation with Idempotency-Key
    const res1 = await request(app)
      .post(`/api/orders/${orderId}/payment`)
      .set('Idempotency-Key', 'UNIQUE-KEY-123')
      .send();
    expect(res1.status).toBe(201);
    expect(res1.body.data.isDuplicate).toBe(false);

    // Send identical request with same key
    const res2 = await request(app)
      .post(`/api/orders/${orderId}/payment`)
      .set('Idempotency-Key', 'UNIQUE-KEY-123')
      .send();
    expect(res2.status).toBe(201);
    expect(res2.body.data.isDuplicate).toBe(true);
    expect(res2.body.data.payment.id).toBe(res1.body.data.payment.id);
  });

  // ==========================================
  // Test 16: Concurrent state updates
  // ==========================================
  it('16. should reject concurrent status update with stale version (409 Conflict)', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    // Attempt transition with wrong/stale expectedVersion
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .send({
        status: 'PAYMENT_PENDING',
        expectedVersion: 99, // Stale version
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/concurrent modification/i);
  });

  // ==========================================
  // Test 17: Audit-log creation
  // ==========================================
  it('17. should record audit log events transactionally across lifecycle', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    // Pay and Start
    const payRes = await request(app).post(`/api/orders/${orderId}/payment`).send();
    await request(app).post(`/api/payments/${payRes.body.data.payment.id}/success`).send();

    // Check audit logs
    const auditRes = await request(app).get(`/api/orders/${orderId}/audit-logs`);
    expect(auditRes.status).toBe(200);
    const events = auditRes.body.data.map((l: any) => l.event);
    expect(events).toContain('ORDER_CREATED');
    expect(events).toContain('PAYMENT_SUCCESS');
  });

  // ==========================================
  // Test 18: Authentication and authorization
  // ==========================================
  it('18. should login user and grant valid JWT token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'customer1@example.com',
        password: 'Customer@123',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();

    // Use token to access profile
    const profileRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.email).toBe('customer1@example.com');
  });

  // ==========================================
  // Test 19: Customers accessing another customer's orders
  // ==========================================
  it('19. should forbid customers from accessing another customer orders (403)', async () => {
    // Login as Customer 1
    const cust1Login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer1@example.com', password: 'Customer@123' });
    const tokenCust1 = cust1Login.body.data.token;

    // Login as Customer 2
    const cust2Login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer2@example.com', password: 'Customer@123' });
    const tokenCust2 = cust2Login.body.data.token;

    // Customer 1 creates an order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenCust1}`)
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;

    // Customer 2 attempts to fetch Customer 1's order
    const unauthorizedAccess = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenCust2}`);

    expect(unauthorizedAccess.status).toBe(403);
    expect(unauthorizedAccess.body.error.code).toBe('ForbiddenError');
  });

  // ==========================================
  // Test 20: Kiosk operators accessing unauthorized jobs
  // ==========================================
  it('20. should forbid kiosk operator from managing jobs on unassigned kiosks (403)', async () => {
    // Operator 2 is assigned to KIOSK002 only
    const op2Login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'operator2@smartprint.com', password: 'Operator@123' });
    const tokenOp2 = op2Login.body.data.token;

    // Create order on KIOSK001 (assigned to operator 1) and pay for it
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'CUS001',
        kioskId: 'KIOSK001',
        fileUrl: 'https://example.com/doc.pdf',
        copies: 1,
        paperSize: 'A4',
        colorMode: 'BW',
      });
    const orderId = orderRes.body.data.orderId;
    const jobId = orderRes.body.data.printJob.id;

    const payRes = await request(app).post(`/api/orders/${orderId}/payment`).send();
    await request(app).post(`/api/payments/${payRes.body.data.payment.id}/success`).send();

    // Operator 2 attempts to start a job on KIOSK001
    const forbiddenStart = await request(app)
      .post(`/api/print-jobs/${jobId}/start`)
      .set('Authorization', `Bearer ${tokenOp2}`)
      .send();

    expect(forbiddenStart.status).toBe(403);
    expect(forbiddenStart.body.error.code).toBe('ForbiddenError');
  });
});

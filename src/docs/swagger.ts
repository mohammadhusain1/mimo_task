import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Smart Print Order & Job Management System API',
    version: '1.0.0',
    description: `
### Smart Print Order & Job Management System
Robust, multi-kiosk enterprise printing backend with state machine lifecycle, simulated payments, mock printer hardware integration, transactional auditing, and role-based JWT security.

#### Core Lifecycle:
\`CREATED\` ➔ \`PAYMENT_PENDING\` ➔ \`PAID\` ➔ \`PRINTING\` ➔ \`COMPLETED\`
*(Failure/Cancel: \`PAYMENT_FAILED\`, \`PRINT_FAILED\`, \`CANCELLED\`)*
    `,
    contact: {
      name: 'Smart Print Engineering Team',
      email: 'dev@smartprint.local',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server',
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /api/auth/login',
      },
    },
    schemas: {
      CreateOrderRequest: {
        type: 'object',
        required: ['customerId', 'kioskId', 'fileUrl', 'copies', 'paperSize', 'colorMode'],
        properties: {
          customerId: { type: 'string', example: 'CUS001' },
          kioskId: { type: 'string', example: 'KIOSK001' },
          fileUrl: { type: 'string', format: 'uri', example: 'https://example.com/document.pdf' },
          copies: { type: 'integer', minimum: 1, example: 3 },
          paperSize: { type: 'string', enum: ['A4', 'A3', 'A5'], example: 'A4' },
          colorMode: { type: 'string', enum: ['BW', 'COLOR'], example: 'BW' },
        },
      },
      OrderResponse: {
        type: 'object',
        properties: {
          orderId: { type: 'string', example: 'ORD-M738Z-9X1A' },
          status: { type: 'string', example: 'CREATED' },
          customerId: { type: 'string', example: 'CUS001' },
          kioskId: { type: 'string', example: 'KIOSK001' },
          fileUrl: { type: 'string', example: 'https://example.com/document.pdf' },
          specifications: {
            type: 'object',
            properties: {
              paperSize: { type: 'string', example: 'A4' },
              colorMode: { type: 'string', example: 'BW' },
              pageCount: { type: 'integer', example: 3 },
              copies: { type: 'integer', example: 3 },
              totalPagesToPrint: { type: 'integer', example: 9 },
            },
          },
          pricing: {
            type: 'object',
            properties: {
              basePricePerPageCents: { type: 'integer', example: 10 },
              totalPriceCents: { type: 'integer', example: 90 },
              currency: { type: 'string', example: 'USD' },
              formattedTotalPrice: { type: 'string', example: '$0.90' },
            },
          },
          printJob: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'JOB-M738Z-42L1' },
              status: { type: 'string', example: 'QUEUED' },
              kioskId: { type: 'string', example: 'KIOSK001' },
              attempts: { type: 'integer', example: 0 },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'ConflictError' },
              message: { type: 'string', example: 'Invalid state transition' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/orders': {
      post: {
        summary: 'Create a new print order',
        description: 'Validates inputs, calculates server-side price based on page count and specifications, and generates a linked print job atomically.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateOrderRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Order created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/OrderResponse' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation or eligibility error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Customer or Kiosk not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      get: {
        summary: 'List orders with pagination & filters',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'customerId', in: 'query', schema: { type: 'string' } },
          { name: 'kioskId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated list of orders' },
        },
      },
    },
    '/api/orders/{orderId}': {
      get: {
        summary: 'Get order details by ID',
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Order details' },
          404: { description: 'Order not found' },
        },
      },
    },
    '/api/orders/{orderId}/status': {
      patch: {
        summary: 'Request validated state transition',
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', example: 'PAYMENT_PENDING' },
                  reason: { type: 'string', example: 'Customer started checkout' },
                  expectedVersion: { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Transition successful' },
          409: { description: 'Conflict: Invalid transition or concurrent modification' },
        },
      },
    },
    '/api/orders/{orderId}/cancel': {
      post: {
        summary: 'Cancel an eligible order',
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { reason: { type: 'string', example: 'Customer cancelled' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Order cancelled successfully' },
          409: { description: 'Cannot cancel order after printing starts' },
        },
      },
    },
    '/api/orders/{orderId}/audit-logs': {
      get: {
        summary: 'Retrieve audit trail for an order',
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Audit history entries' },
        },
      },
    },
    '/api/orders/{orderId}/payment': {
      post: {
        summary: 'Initiate payment for an order',
        parameters: [
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } },
        ],
        responses: {
          201: { description: 'Payment initiated, order moved to PAYMENT_PENDING' },
          409: { description: 'Order already paid or cancelled' },
        },
      },
    },
    '/api/payments/{paymentId}/success': {
      post: {
        summary: 'Simulate or report payment success',
        parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Payment confirmed, order status moved to PAID' },
          409: { description: 'Conflict: Payment already failed' },
        },
      },
    },
    '/api/payments/{paymentId}/failure': {
      post: {
        summary: 'Simulate or report payment failure',
        parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Payment failed, order status moved to PAYMENT_FAILED' },
        },
      },
    },
    '/api/print-jobs': {
      get: {
        summary: 'List print jobs',
        parameters: [
          { name: 'kioskId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Print jobs list' },
        },
      },
    },
    '/api/print-jobs/{jobId}': {
      get: {
        summary: 'Get print job by ID',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Print job details' },
        },
      },
    },
    '/api/print-jobs/{jobId}/start': {
      post: {
        summary: 'Start hardware printing for job',
        description: 'Requires order to be PAID. Updates job and order status to PRINTING.',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job started' },
          409: { description: 'Cannot start: Order is not PAID or job already running' },
        },
      },
    },
    '/api/print-jobs/{jobId}/complete': {
      post: {
        summary: 'Complete print job',
        description: 'Updates both job and order status to COMPLETED.',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job completed' },
        },
      },
    },
    '/api/print-jobs/{jobId}/fail': {
      post: {
        summary: 'Record print job failure',
        description: 'Updates job to FAILED and order to PRINT_FAILED.',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job marked failed' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Register new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'newuser@example.com' },
                  password: { type: 'string', minLength: 8, example: 'SecurePass@123' },
                  name: { type: 'string', example: 'Alice Customer' },
                  role: { type: 'string', enum: ['CUSTOMER', 'KIOSK_OPERATOR', 'ADMIN'], default: 'CUSTOMER' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Registered successfully' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Login and obtain JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'customer1@example.com' },
                  password: { type: 'string', example: 'Customer@123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful, returns JWT token' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/profile': {
      get: {
        summary: 'Get current user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'User profile' },
          401: { description: 'Unauthorized' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Smart Print API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
}

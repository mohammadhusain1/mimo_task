# Smart Print Order & Job Management System

Enterprise-grade backend application for a multi-kiosk cloud printing platform built with Node.js, TypeScript, Express.js, PostgreSQL, and Prisma ORM.

---

## 📋 Table of Contents

- [Overview & Architecture](#overview--architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup & Migrations](#database-setup--migrations)
  - [Database Seeding](#database-seeding)
- [Running the Application](#running-the-application)
  - [Development Mode](#development-mode)
  - [Production Build & Run](#production-build--run)
  - [Docker & Docker Compose](#docker--docker-compose)
- [API Documentation & Swagger UI](#api-documentation--swagger-ui)
- [Order Lifecycle State Machine](#order-lifecycle-state-machine)
- [Core Endpoints & Workflow](#core-endpoints--workflow)
- [Security & Error Handling](#security--error-handling)
- [Automated Testing](#automated-testing)
- [Postman Collection](#postman-collection)

---

## 🏛️ Overview & Architecture

The **Smart Print Order & Job Management System** manages document print jobs across self-service kiosks with strict business integrity guarantees:

1. **Deterministic Server-Side Pricing**: Calculates prices in integer minor units (cents) using document page count, copies, paper size (A4, A3, A5), and color mode (BW, COLOR). Client-submitted prices are ignored.
2. **Explicit Finite State Machine**: Enforces a strict transition allowlist. Prevents race conditions with optimistic concurrency locking and rejects illegal transitions with `409 Conflict`.
3. **Hardware Printer Adapter**: Provides a decoupled mock printer adapter simulating queueing, hardware telemetry, paper levels, and fault simulation.
4. **Append-Only Audit Trail**: Transactionally commits an audit log entry with every state update.
5. **Idempotent Simulated Payments**: Prevents duplicate payments using idempotency keys and handles simulated success and failure callbacks.
6. **Role-Based Access Control**: Scopes orders and print jobs to authorized customers, kiosk operators, and system administrators via JWT tokens.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js (v20+ / v24+)
- **Language**: TypeScript (strict mode)
- **Framework**: Express.js
- **Database & ORM**: PostgreSQL & Prisma ORM
- **Validation**: Zod
- **Authentication**: JWT (`jsonwebtoken`) & `bcryptjs`
- **Security**: Helmet, CORS, Express Rate Limit, SSRF protection
- **Documentation**: Swagger UI & OpenAPI 3.0 (`/api/docs`)
- **Testing**: Jest & Supertest
- **Containerization**: Docker & Docker Compose

---

## 📂 Project Structure

```text
smart-print-system/
├── prisma/
│   ├── schema.prisma                  # Prisma ORM schema & relations
│   ├── migrations/                    # PostgreSQL SQL migration files
│   │   └── 20261009000000_init/
│   │       └── migration.sql
│   └── seed.ts                        # Development seed script
├── src/
│   ├── app.ts                         # Express application setup & middleware
│   ├── server.ts                      # Server entry point & graceful shutdown
│   ├── config/
│   │   ├── env.ts                     # Zod-validated environment config
│   │   └── database.ts                # PrismaClient singleton & health check
│   ├── docs/
│   │   └── swagger.ts                 # OpenAPI 3.0 spec & Swagger UI mount
│   ├── middleware/
│   │   ├── auth.middleware.ts         # JWT authentication & RBAC
│   │   ├── error.middleware.ts        # Centralized error handler
│   │   ├── rate-limiter.middleware.ts # Rate limiting
│   │   └── validate.middleware.ts     # Zod request validation
│   ├── modules/
│   │   ├── auth/                      # Authentication routes, services, schemas
│   │   ├── audit-logs/                # Audit trail listing
│   │   ├── kiosks/                    # Kiosk registry
│   │   ├── orders/                    # Order management & lifecycle
│   │   ├── payments/                  # Payment initiation & simulation
│   │   ├── pricing/                   # Pricing matrix
│   │   └── print-jobs/                # Print job processing & execution
│   ├── services/
│   │   ├── file-page-counter.service.ts # Safe URL parsing & page count detection
│   │   ├── pricing.service.ts         # Integer-unit price calculation
│   │   ├── printer-adapter.service.ts # Hardware printer simulation adapter
│   │   └── state-machine.service.ts   # Finite state machine transition engine
│   └── utils/
│       ├── errors.ts                  # Standard custom error hierarchy
│       ├── logger.ts                  # Sanitized logging without secrets
│       └── response.ts                # Uniform API JSON response envelopes
├── tests/
│   ├── mock-db.ts                     # Complete in-memory test database engine
│   └── smart-print.test.ts            # 20 automated integration scenarios
├── postman/
│   └── collection.json                # Postman API collection
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── jest.config.js
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher; v20/v24 recommended)
- npm (v9 or higher)
- PostgreSQL (local instance, Docker, or Supabase connection)

### Environment Configuration

Copy the example configuration to `.env`:

```bash
cp .env.example .env
```

Review or modify `.env`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/smart_print?schema=public"
JWT_SECRET="super_secret_jwt_key_for_smart_print_system_2026_min_32_chars"
JWT_EXPIRES_IN="24h"
CORS_ORIGIN="*"
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
FILE_STORAGE_ALLOWLIST="example.com,storage.googleapis.com,s3.amazonaws.com,cdn.smartprint.local"
PAGE_COUNT_DEFAULT=1
ADMIN_EMAIL="admin@smartprint.com"
ADMIN_PASSWORD="Admin@123"
```

### Database Setup & Migrations

If using Docker for local PostgreSQL:

```bash
docker compose up -d postgres
```

Generate Prisma Client and deploy migrations:

```bash
# Generate Prisma Client
npm run prisma:generate

# Apply migrations
npm run prisma:deploy
```

### Database Seeding

Populate the database with test accounts, kiosks, and pricing rules:

```bash
npm run prisma:seed
```

#### Seeded Accounts:
| Role | Email | Password | Identifier / Assigned Kiosks |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@smartprint.com` | `Admin@123` | Full system access |
| **CUSTOMER** | `customer1@example.com` | `Customer@123` | Customer ID: `CUS001` |
| **CUSTOMER** | `customer2@example.com` | `Customer@123` | Customer ID: `CUS002` |
| **KIOSK_OPERATOR** | `operator1@smartprint.com` | `Operator@123` | Assigned to `KIOSK001` |
| **KIOSK_OPERATOR** | `operator2@smartprint.com` | `Operator@123` | Assigned to `KIOSK002` |

#### Seeded Kiosks:
- `KIOSK001`: Central Library Kiosk (`ACTIVE`)
- `KIOSK002`: Student Union Kiosk (`ACTIVE`)
- `KIOSK003`: Dormitory Kiosk (`MAINTENANCE`)

---

## 🏃 Running the Application

### Development Mode (with hot-reload)

```bash
npm run dev
```

The server will start at `http://localhost:3000`.

### Production Build & Run

```bash
npm run build
npm start
```

### Docker & Docker Compose

Start both PostgreSQL and the API container:

```bash
docker compose up --build
```

---

## 📖 API Documentation & Swagger UI

Interactive OpenAPI 3.0 documentation with Swagger UI is hosted at:

**`http://localhost:3000/api/docs`**

Swagger UI provides full documentation of all schemas, parameters, response codes, and allows direct test execution of requests in the browser.

---

## 🔄 Order Lifecycle State Machine

```
              ┌───────────────┐
              │    CREATED    │
              └───────┬───────┘
                      │
           ┌──────────┴──────────┐
           │ (start payment)     │ (cancel)
           ▼                     ▼
┌───────────────────┐    ┌───────────────┐
│  PAYMENT_PENDING  │    │   CANCELLED   │ (terminal)
└──────────┬────────┘    └───────────────┘
           │
     ┌─────┴──────────────┐
     │ (success)          │ (failed)
     ▼                    ▼
┌──────────────┐   ┌────────────────┐
│     PAID     │   │ PAYMENT_FAILED │ (terminal)
└──────┬───────┘   └────────────────┘
       │
       │ (start printing)
       ▼
┌──────────────┐
│   PRINTING   │
└──────┬───────┘
       │
 ┌─────┴──────────────┐
 │ (complete)         │ (hardware fail)
 ▼                    ▼
┌──────────────┐   ┌────────────────┐
│  COMPLETED   │   │  PRINT_FAILED  │ (terminal)
└──────────────┘   └────────────────┘
  (terminal)
```

### Transition Rules & Guarantees:
- `CREATED` ➔ `PAYMENT_PENDING`, `CANCELLED`
- `PAYMENT_PENDING` ➔ `PAID`, `PAYMENT_FAILED`, `CANCELLED`
- `PAID` ➔ `PRINTING`, `CANCELLED` (cancellation permitted only before printing begins)
- `PRINTING` ➔ `COMPLETED`, `PRINT_FAILED` (cancellation rejected)
- Terminal states cannot transition to any other status.
- Invalid transitions immediately return `409 Conflict`.
- Printing cannot begin until the order is `PAID`.

---

## 📡 Core Endpoints & Workflow

### 1. Create Order
**`POST /api/orders`**
```json
{
  "customerId": "CUS001",
  "kioskId": "KIOSK001",
  "fileUrl": "https://example.com/document.pdf?pages=4",
  "copies": 2,
  "paperSize": "A4",
  "colorMode": "COLOR"
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "orderId": "ORD-MV0G-81X",
    "status": "CREATED",
    "customerId": "CUS001",
    "kioskId": "KIOSK001",
    "specifications": {
      "paperSize": "A4",
      "colorMode": "COLOR",
      "pageCount": 4,
      "copies": 2,
      "totalPagesToPrint": 8
    },
    "pricing": {
      "basePricePerPageCents": 50,
      "totalPriceCents": 400,
      "currency": "USD",
      "formattedTotalPrice": "$4.00"
    },
    "printJob": {
      "id": "JOB-MV0G-99A",
      "status": "QUEUED",
      "kioskId": "KIOSK001",
      "attempts": 0
    }
  }
}
```

### 2. Initiate Payment
**`POST /api/orders/:orderId/payment`**
Header: `Idempotency-Key: my-unique-key-123`
```json
{
  "provider": "SIMULATED"
}
```
Order moves to `PAYMENT_PENDING` and returns payment record.

### 3. Payment Success / Failure Simulation
- **`POST /api/payments/:paymentId/success`**: Marks payment as `SUCCESS` and updates order to `PAID`.
- **`POST /api/payments/:paymentId/failure`**: Marks payment as `FAILED` and updates order to `PAYMENT_FAILED`.

### 4. Start Hardware Printing
**`POST /api/print-jobs/:jobId/start`**
*(Requires order to be `PAID`. Kiosk operator can only start jobs assigned to their kiosk).*
Updates order and job status to `PRINTING`.

### 5. Complete / Fail Printing
- **`POST /api/print-jobs/:jobId/complete`**: Updates job and order to `COMPLETED`.
- **`POST /api/print-jobs/:jobId/fail`**: Updates job to `FAILED` and order to `PRINT_FAILED`.

### 6. Audit Trail
**`GET /api/orders/:orderId/audit-logs`**: Retrieves the transactional audit history.

---

## 🔒 Security & Error Handling

- **Uniform Error Envelope**:
  ```json
  {
    "success": false,
    "error": {
      "code": "ConflictError",
      "message": "Cannot start print job: Order status is CREATED, but must be PAID"
    }
  }
  ```
- **SSRF Protection**: Validates document URLs against private/loopback/link-local metadata addresses (`169.254.169.254`, `127.0.0.1`, etc.).
- **Sanitized Logging**: Automatically masks passwords, bearer tokens, and URL authentication parameters.
- **Role Permissions**:
  - `CUSTOMER`: restricted to their own orders and jobs.
  - `KIOSK_OPERATOR`: restricted to their assigned kiosks.
  - `ADMIN`: full system visibility.

---

## 🧪 Automated Testing

The automated test suite in `tests/smart-print.test.ts` covers all 20 required scenarios:

```bash
npm run test
```

### Test Scenarios Covered:
1. ✅ Successful order creation
2. ✅ Invalid order input validation (Zod schema checking)
3. ✅ Missing customer or kiosk verification (404)
4. ✅ Unsupported paper sizes rejection
5. ✅ Invalid copy count (zero / negative) rejection
6. ✅ Server-side price calculation accuracy (ignoring client prices)
7. ✅ Automatic linked print-job creation in `QUEUED` status
8. ✅ Successful payment simulation (transitions order to `PAID`)
9. ✅ Failed payment simulation (transitions order to `PAYMENT_FAILED`)
10. ✅ Printing before payment rejection (`409 Conflict`)
11. ✅ Successful printing and completion (`COMPLETED`)
12. ✅ Print failure recording (`FAILED` job / `PRINT_FAILED` order)
13. ✅ Invalid state transitions rejection (`409 Conflict`)
14. ✅ Order cancellation rules (permitted before printing, rejected after)
15. ✅ Duplicate payment requests idempotency
16. ✅ Concurrent state updates with optimistic version locking
17. ✅ Transactional audit log creation across the lifecycle
18. ✅ Authentication and JWT token issuance
19. ✅ Customers accessing another customer's orders rejection (`403 Forbidden`)
20. ✅ Kiosk operators accessing unauthorized jobs rejection (`403 Forbidden`)

---

## 📮 Postman Collection

Import `postman/collection.json` into Postman or Insomnia. It includes:
- Authentication (Customer, Admin login, Profile)
- Order Management (Create, List, Details, Cancel, Audit Logs)
- Payment Processing (Initiation with Idempotency header, Success & Failure callbacks)
- Print Jobs (List, Start, Complete, Fail)
- Kiosks & Pricing Tables

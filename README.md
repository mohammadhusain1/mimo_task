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
- [Security & Authorization Hardening](#security--authorization-hardening)
  - [1. Mandatory Authentication on Sensitive Endpoints](#1-mandatory-authentication-on-sensitive-endpoints)
  - [2. Role-Based Permissions Matrix (RBAC)](#2-role-based-permissions-matrix-rbac)
  - [3. Payment Security & Atomic Database Transactions](#3-payment-security--atomic-database-transactions)
  - [4. SSRF Defense & File URL Safety](#4-ssrf-defense--file-url-safety)
  - [5. Concurrency Control & Duplicate Print-Job Prevention](#5-concurrency-control--duplicate-print-job-prevention)
- [Order Lifecycle State Machine](#order-lifecycle-state-machine)
- [Core Endpoints & Workflow](#core-endpoints--workflow)
- [API Documentation & Swagger UI](#api-documentation--swagger-ui)
- [Automated Testing & Actual Results](#automated-testing--actual-results)
- [Postman Collection](#postman-collection)

---

## 🏛️ Overview & Architecture

The **Smart Print Order & Job Management System** manages document print jobs across self-service kiosks with strict business integrity guarantees:

1. **Deterministic Server-Side Pricing**: Calculates prices in integer minor units (cents) using document page count, copies, paper size (A4, A3, A5), and color mode (BW, COLOR). Client-submitted prices are ignored.
2. **Explicit Finite State Machine**: Enforces a strict transition allowlist. Prevents race conditions with optimistic concurrency locking (`version` field) and rejects illegal transitions with `409 Conflict`.
3. **Hardware Printer Adapter**: Provides a decoupled mock printer adapter simulating queueing, hardware telemetry, paper levels, and fault simulation.
4. **Append-Only Audit Trail**: Transactionally commits an audit log entry with every state update.
5. **Idempotent Payments & Single Atomic Transactions**: Prevents duplicate payments using idempotency keys. Processes payment status updates, order state transitions, and audit logs within a single database transaction.
6. **Role-Based Access Control**: Scopes orders and print jobs to authorized customers, kiosk operators, and system administrators via JWT tokens.
7. **Bulletproof SSRF Prevention**: Enforces strict URL validation, blocking loopback/private/cloud metadata IP addresses and restricting document fetches to approved storage domains.

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
│   │   ├── rate-limiter.middleware.ts # Rate limiting (bypassed in test env)
│   │   └── validate.middleware.ts     # Zod request validation
│   ├── modules/
│   │   ├── auth/                      # Authentication routes, services, schemas
│   │   ├── audit-logs/                # Admin-only audit trail
│   │   ├── kiosks/                    # Kiosk registry
│   │   ├── orders/                    # Order management & lifecycle
│   │   ├── payments/                  # Payment initiation & secure processing
│   │   ├── pricing/                   # Pricing matrix
│   │   └── print-jobs/                # Print job processing, execution & locks
│   ├── services/
│   │   ├── file-page-counter.service.ts # SSRF validation & page count detection
│   │   ├── pricing.service.ts         # Integer-unit price calculation
│   │   ├── printer-adapter.service.ts # Hardware printer simulation adapter
│   │   └── state-machine.service.ts   # Finite state machine transition engine
│   └── utils/
│       ├── errors.ts                  # Standard custom error hierarchy
│       ├── logger.ts                  # Sanitized logging without secrets
│       └── response.ts                # Uniform API JSON response envelopes
├── tests/
│   ├── mock-db.ts                     # In-memory transactional test database
│   └── smart-print.test.ts            # 47 automated integration test scenarios
├── postman/
│   └── collection.json                # Postman API collection with auth
├── .env.example
├── .gitignore                         # Excludes sensitive files & pgdata/
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
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smart_print?schema=public"
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
| Role | Email | Password | Identifier / Scope |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@smartprint.com` | `Admin@123` | Full administrative access |
| **CUSTOMER** | `customer1@example.com` | `Customer@123` | Customer ID: `CUS001` |
| **CUSTOMER** | `customer2@example.com` | `Customer@123` | Customer ID: `CUS002` |
| **KIOSK_OPERATOR** | `operator1@smartprint.com` | `Operator@123` | Assigned to `KIOSK001` |
| **KIOSK_OPERATOR** | `operator2@smartprint.com` | `Operator@123` | Assigned to `KIOSK002` |

#### Seeded Kiosks:
- `KIOSK001`: Central Library Kiosk (`ACTIVE`, operator: `operator1@smartprint.com`)
- `KIOSK002`: Student Union Kiosk (`ACTIVE`, operator: `operator2@smartprint.com`)
- `KIOSK003`: Dormitory Kiosk (`MAINTENANCE`, unassigned)

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

## 🔒 Security & Authorization Hardening

### 1. Mandatory Authentication on Sensitive Endpoints
Authentication via JWT Bearer token is strictly mandatory on all sensitive routes:
- `POST /api/orders`: Authenticated (`CUSTOMER`, `ADMIN`)
- `GET /api/orders`: Authenticated (scoped by role)
- `GET /api/orders/:orderId`: Authenticated (authorized by role/ownership)
- `POST /api/orders/:orderId/payment`: Authenticated (`CUSTOMER`, `ADMIN`)
- `PATCH /api/orders/:orderId/status`: Authenticated (`ADMIN` only)
- `POST /api/orders/:orderId/cancel`: Authenticated (`CUSTOMER`, `ADMIN`)
- `GET /api/orders/:orderId/audit-logs`: Authenticated (authorized parties)
- `POST /api/payments/:paymentId/success`: Authenticated (`CUSTOMER`, `ADMIN`)
- `POST /api/payments/:paymentId/failure`: Authenticated (`CUSTOMER`, `ADMIN`)
- `GET /api/print-jobs`: Authenticated (scoped by role)
- `GET /api/print-jobs/:jobId`: Authenticated (authorized parties)
- `POST /api/print-jobs/:jobId/start`: Authenticated (`ADMIN`, `KIOSK_OPERATOR`)
- `POST /api/print-jobs/:jobId/complete`: Authenticated (`ADMIN`, `KIOSK_OPERATOR`)
- `POST /api/print-jobs/:jobId/fail`: Authenticated (`ADMIN`, `KIOSK_OPERATOR`)
- `GET /api/audit-logs`: Authenticated (`ADMIN` only)

Unauthenticated requests to any of these endpoints return `401 Unauthorized`.

### 2. Role-Based Permissions Matrix (RBAC)

| Resource / Endpoint | `CUSTOMER` | `KIOSK_OPERATOR` | `ADMIN` |
| :--- | :---: | :---: | :---: |
| **Create Order** (`POST /api/orders`) | ✅ (Own account only) | ❌ (`403 Forbidden`) | ✅ |
| **List Orders** (`GET /api/orders`) | ✅ (Filtered to own) | ✅ (Filtered to assigned kiosks) | ✅ (All orders) |
| **View Order** (`GET /api/orders/:id`) | ✅ (Own order only) | ✅ (Assigned kiosk only) | ✅ (Any order) |
| **Initiate Payment** (`POST /api/orders/:id/payment`) | ✅ (Own order only) | ❌ (`403 Forbidden`) | ✅ |
| **Simulate Payment** (`POST /api/payments/:id/success`) | ✅ (Own order only) | ❌ (`403 Forbidden`) | ✅ |
| **Cancel Order** (`POST /api/orders/:id/cancel`) | ✅ (Own order only) | ❌ (`403 Forbidden`) | ✅ |
| **Manual Status Override** (`PATCH /api/orders/:id/status`) | ❌ (`403 Forbidden`) | ❌ (`403 Forbidden`) | ✅ |
| **Start Print Job** (`POST /api/print-jobs/:id/start`) | ❌ (`403 Forbidden`) | ✅ (Assigned kiosk only) | ✅ |
| **Complete Print Job** (`POST /api/print-jobs/:id/complete`) | ❌ (`403 Forbidden`) | ✅ (Assigned kiosk only) | ✅ |
| **Fail Print Job** (`POST /api/print-jobs/:id/fail`) | ❌ (`403 Forbidden`) | ✅ (Assigned kiosk only) | ✅ |
| **System Audit Logs** (`GET /api/audit-logs`) | ❌ (`403 Forbidden`) | ❌ (`403 Forbidden`) | ✅ |

### 3. Payment Security & Atomic Database Transactions
- **Ownership Verification**: Customers can only process payments for their own orders. Requests by unauthorized customers return `403 Forbidden`. Kiosk operators are blocked from payment processing.
- **Single Database Transaction**: Payment status update (`Payment.status = SUCCESS`), order state transition (`Order.status = PAID`), and audit log entry (`AuditLog.event = PAYMENT_SUCCESS`) are executed within a **single database transaction** (`prisma.$transaction`). If any transition check fails or version conflict occurs, the entire transaction rolls back cleanly.
- **Integrity Validation**: Succeeded payments cannot be failed, failed payments cannot be succeeded, and payments cannot be processed on cancelled orders (`409 Conflict`).

### 4. SSRF Defense & File URL Safety
`FilePageCounterService.validateUrlSafety` performs comprehensive verification:
- **Protocol Restrictions**: Only `http:` and `https:` schemes allowed. `file:`, `ftp:`, `gopher:`, `data:` are blocked.
- **Credential & Port Blocking**: URLs containing embedded user credentials or non-standard ports (e.g. 22, 25, 3306, 5432, 8080) are rejected (`400 Bad Request`).
- **Private & Metadata IP Blocking**:
  - Loopback (`127.0.0.0/8`, `localhost`, `*.localhost`)
  - Private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`, `instance-data`)
  - Encoded / decimal IP representations (e.g., `2130706433`, `0x7f000001`)
  - IPv6 loopback, unspecified, and unique local addresses (`::1`, `fe80:`, `fc00:`, `fd00:`, `::ffff:`)
- **Storage Domain Allowlist**: Hostnames are strictly matched against `env.FILE_STORAGE_ALLOWLIST`. Disallowed domains are rejected with `400 Bad Request`.

### 5. Concurrency Control & Duplicate Print-Job Prevention
- **In-Flight Job Mutex**: `PrintJobService` maintains an in-memory execution lock per `jobId`. Concurrent requests attempting to start, complete, or fail the same job simultaneously are safely intercepted.
- **Optimistic Concurrency Control**: All state transitions check the `Order.version` field. When two requests attempt to transition an order simultaneously, the second request fails with `409 Conflict` due to version mismatch, preventing duplicate hardware execution.

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

### Transition Rules:
- `CREATED` ➔ `PAYMENT_PENDING`, `CANCELLED`
- `PAYMENT_PENDING` ➔ `PAID`, `PAYMENT_FAILED`, `CANCELLED`
- `PAID` ➔ `PRINTING`, `CANCELLED` (cancellation permitted only before printing begins)
- `PRINTING` ➔ `COMPLETED`, `PRINT_FAILED` (cancellation rejected)
- Terminal states cannot transition to any other status.
- Printing cannot begin until the order is `PAID`.

---

## 📡 Core Endpoints & Workflow

### 1. Authenticate (Customer / Operator / Admin)
**`POST /api/auth/login`**
```json
{
  "email": "customer1@example.com",
  "password": "Customer@123"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": { "id": "cust-user-1", "email": "customer1@example.com", "role": "CUSTOMER" }
  }
}
```

### 2. Create Order
**`POST /api/orders`** *(Requires Bearer Token)*
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

### 3. Initiate Payment
**`POST /api/orders/:orderId/payment`**
Header: `Idempotency-Key: my-unique-key-123`
```json
{ "provider": "SIMULATED" }
```

### 4. Process Payment Simulation
- **`POST /api/payments/:paymentId/success`**: Atomically updates payment to `SUCCESS`, order to `PAID`, and logs audit entry.
- **`POST /api/payments/:paymentId/failure`**: Atomically updates payment to `FAILED`, order to `PAYMENT_FAILED`, and logs audit entry.

### 5. Hardware Print Job Execution (Kiosk Operator / Admin)
- **`POST /api/print-jobs/:jobId/start`**: Sends job to printer adapter and moves order/job to `PRINTING`.
- **`POST /api/print-jobs/:jobId/complete`**: Marks job/order as `COMPLETED`.
- **`POST /api/print-jobs/:jobId/fail`**: Marks job as `FAILED` and order as `PRINT_FAILED`.

---

## 📖 API Documentation & Swagger UI

Interactive OpenAPI 3.0 documentation with Swagger UI is hosted at:

**`http://localhost:3000/api/docs`**

Swagger UI provides full documentation of all schemas, parameters, security requirements (`bearerAuth`), and response codes.

---

## 🧪 Automated Testing & Actual Results

Run TypeScript compilation and all automated integration test suites:

```bash
# TypeScript compilation check
npm run build

# Run all test suites
npm test
```

### Actual Test Execution Results:

```text
PASS tests/smart-print.test.ts (5.369 s)
  Smart Print Order & Job Management System
    √ 1. should successfully create an order with valid input (112 ms)
    √ 2. should reject order with missing or malformed fields (400) (53 ms)
    √ 3. should return 404 when customer or kiosk does not exist (49 ms)
    √ 4. should reject unsupported paper sizes with 400 (28 ms)
    √ 5. should reject zero or negative copy count (51 ms)
    √ 6. should correctly calculate price without trusting client values (25 ms)
    √ 7. should automatically create linked print job in QUEUED status (49 ms)
    √ 8. should transition order to PAID after successful payment simulation (89 ms)
    √ 9. should transition order to PAYMENT_FAILED after failed payment simulation (87 ms)
    √ 10. should reject starting print job before order is PAID (409 Conflict) (64 ms)
    √ 11. should transition job and order to COMPLETED upon successful print finish (135 ms)
    √ 12. should record FAILED job and PRINT_FAILED order when print fails (101 ms)
    √ 13. should reject invalid state transitions with 409 Conflict (46 ms)
    √ 14. should permit cancellation before printing and reject after printing starts (102 ms)
    √ 15. should handle duplicate payment requests idempotently (46 ms)
    √ 16. should reject concurrent status update with stale version (409 Conflict) (34 ms)
    √ 17. should record audit log events transactionally across lifecycle (64 ms)
    √ 18. should login user and grant valid JWT token (36 ms)
    √ 19. should forbid customers from accessing another customer orders (403) (67 ms)
    √ 20. should forbid kiosk operator from managing jobs on unassigned kiosks (403) (154 ms)
  Authentication Enforcement on Sensitive Endpoints
    √ 21. should reject unauthenticated requests to POST /api/orders with 401 (25 ms)
    √ 22. should reject unauthenticated requests to POST /api/orders/:id/payment with 401 (23 ms)
    √ 23. should reject unauthenticated requests to POST /api/payments/:id/success with 401 (23 ms)
    √ 24. should reject unauthenticated requests to POST /api/print-jobs/:id/start with 401 (21 ms)
    √ 25. should reject unauthenticated requests to GET /api/audit-logs with 401 (21 ms)
    √ 26. should reject requests with invalid or malformed bearer token with 401 (23 ms)
  Role-Based Permissions (RBAC)
    √ 27. should forbid CUSTOMER from accessing system audit logs GET /api/audit-logs (403) (18 ms)
    √ 28. should forbid KIOSK_OPERATOR from accessing system audit logs GET /api/audit-logs (403) (21 ms)
    √ 29. should allow ADMIN to access system audit logs GET /api/audit-logs (200) (18 ms)
    √ 30. should forbid CUSTOMER from starting or completing print jobs (403) (23 ms)
    √ 31. should forbid CUSTOMER from manually overriding order status via PATCH (403) (21 ms)
    √ 32. should forbid KIOSK_OPERATOR from placing customer orders (403) (21 ms)
    √ 33. should forbid customer from initiating payment for another customer order (403) (41 ms)
    √ 34. should forbid customer from cancelling another customer order (403) (32 ms)
  Payment Security & Transactional Processing
    √ 35. should forbid customer from calling payment success for another customer payment (403) (52 ms)
    √ 36. should forbid kiosk operator from triggering payment success (403) (51 ms)
    √ 37. should reject payment success on an already failed payment (409) (61 ms)
    √ 38. should reject payment failure on an already succeeded payment (409) (62 ms)
    √ 39. should atomically update payment to SUCCESS, order to PAID, and record audit log in a single transaction (58 ms)
  SSRF Protection & File URL Safety
    √ 40. should reject file URL with loopback IP (127.0.0.1) with 400 (25 ms)
    √ 41. should reject file URL with private internal IP (10.0.0.1, 192.168.1.1) with 400 (41 ms)
    √ 42. should reject file URL targeting AWS/Cloud metadata (169.254.169.254) with 400 (25 ms)
    √ 43. should reject file URL with disallowed domain with 400 (28 ms)
    √ 44. should reject file URL with non-HTTP protocol (file://, ftp://) with 400 (21 ms)
    √ 45. should reject file URL with credentials embedded in authority with 400 (21 ms)
  Concurrency & Duplicate Execution Protection
    √ 46. should prevent duplicate print job execution when two start requests are fired concurrently (97 ms)
    √ 47. should prevent concurrent complete print job requests from double completing (94 ms)

Test Suites: 1 passed, 1 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Time:        5.842 s
Ran all test suites.
```

### PostgreSQL Integration Status:
- Prisma Client generated successfully (`@prisma/client` v5.22.0)
- Prisma Schema (`prisma/schema.prisma`) verified with PostgreSQL relational mapping
- SQL Migrations (`prisma/migrations/20261009000000_init/migration.sql`) verified
- Local PostgreSQL instance verification: Port 5432 is not currently active on this local machine. In environments with an active PostgreSQL server or Docker (`docker compose up -d postgres`), migrations deploy directly via `npm run prisma:deploy`.

---

## 📮 Postman Collection

Import `postman/collection.json` into Postman or Insomnia. It includes authenticated collections with token injection:
- **Auth**: Customer Login, Operator Login, Admin Login, Get Profile
- **Orders**: Create Order, Get Order By ID, List Orders, Cancel Order, Get Audit Logs
- **Payments**: Initiate Payment (with `Idempotency-Key`), Payment Success Simulation, Payment Failure Simulation
- **Print Jobs**: List Print Jobs, Start Print Job, Complete Print Job, Fail Print Job
- **Kiosks & Pricing**: List Kiosks, List Pricing Rules
- **Audit Logs**: System Audit Logs (Admin only)

# Digital Wallet (MERN)

A full-stack digital wallet project with authentication, OTP verification, wallet transfers, transaction history, QR scan/pay flow, and admin endpoints.

## Current Project Status

- Frontend and backend both build and run.
- Payment supports **real Razorpay flow** (order create + signature verify + wallet update in transaction) and mock mode for local testing.
- Backend is hardened with stricter validation, structured logging, global error handling, and atomic wallet operations.
- CI/CD workflow is configured via GitHub Actions to run backend tests, build Docker images, and push to Docker Hub on `main` branch pushes.
- Frontend route flow follows:
  - `/signup`
  - `/signin`
  - `/dashboard`
  - `/send`
- Legacy frontend routes are redirected for compatibility (`/login`, `/register`, `/send-money`).

## Key Design Decisions

- Used JWT access + refresh token flow for stateless authentication with token rotation.
- Used MongoDB sessions/transactions for balance transfer and add-money consistency.
- Separated `User`, `Wallet`, and `Transaction` models for clear domain boundaries.
- Added strong input validation via `express-validator` on auth/payment/wallet APIs.
- Added request logging with Morgan and structured logs with Winston.
- Added indexes for scale on `email`, `createdAt`, `senderId`, and `receiverId` query paths.
- Added request idempotency keys for add-money and transfer APIs to prevent duplicate processing.
- Stores hashed refresh tokens in DB and rotates refresh token on login/refresh.
- Added Razorpay webhook verification and retry-safe reconciliation handling.

## Tech Stack

### Frontend
- React 18 (CRA)
- React Router v6
- Tailwind CSS
- Axios
- Socket.io client
- html5-qrcode + qrcode.react

### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT auth
- Express Validator
- Socket.io
- Winston + Morgan
- Nodemailer

## Project Structure

```text
PatymProject/
  backend/
    controllers/
    middleware/
    models/
    routes/
    tests/
    utils/
    server.js
  frontend/
    src/
      components/
      context/
      pages/
      utils/
    public/
```

## Local Setup

### 1) Backend

```bash
cd backend
npm install
```

Create `.env` from `.env.example` and update values.

Required minimum for local run:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/digital-wallet
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
FRONTEND_URL=http://localhost:3000
```

For real Razorpay flow, also set:

```env
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

Start backend:

```bash
npm run dev
# or
npm start
```

### 2) Frontend

```bash
cd frontend
npm install
```

Create `.env` from `.env.example`.

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SERVER_URL=http://localhost:5000
GENERATE_SOURCEMAP=false
```

Start frontend:

```bash
npm start
```

Frontend runs on `http://localhost:3000`.

## Key Frontend Routes

### Public
- `/signup` - Register
- `/signin` - Login
- `/verify-otp` - OTP verification
- `/forgot-password` - Request password reset
- `/reset-password` - Reset password

### Protected
- `/dashboard` - Wallet overview + recent transactions
- `/add-money` - Add money (Razorpay or mock)
- `/send` - Send money to users
- `/transactions` - Transaction list
- `/profile` - User profile
- `/qr-code` - Show your QR code
- `/scan-qr` - Scan and prefill send flow

## API Overview

### Auth
- `POST /api/auth/register`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/login`
- `POST /api/auth/refresh-token`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/logout`

### Wallet
- `GET /api/wallet/balance`
- `GET /api/wallet/stats`
- `GET /api/wallet/analytics`
- `GET /api/wallet/transactions`
- `GET /api/wallet/search-users`
- `POST /api/wallet/transfer`

### Payment
- `GET /api/payment/methods`
- `POST /api/payment/create-order`
- `POST /api/payment/verify`
- `POST /api/payment/webhook`
  - Verifies `x-razorpay-signature`
  - Reconciles `payment.captured` events
  - Ignores duplicate retries safely

### User
- `GET /api/user/profile`
- `GET /api/user/qr-code`

### Admin
- `GET /api/admin/dashboard`
- `GET /api/admin/users`
- `GET /api/admin/transactions`

### Health
- `GET /api/health`

## Postman Guide (Quick E2E)

Use this order to test complete flow quickly:

1. `POST /api/auth/register`
   - Body:
   ```json
   {
     "name": "Test User",
     "email": "testuser@example.com",
     "phone": "9876543210",
     "password": "Password@123"
   }
   ```

2. `POST /api/auth/verify-otp`
   - Get OTP from your email setup.
   - Body:
   ```json
   {
     "email": "testuser@example.com",
     "otp": "123456"
   }
   ```
   - Save `data.accessToken` from response as a Postman variable, e.g. `token`.

3. `POST /api/auth/login`
   - Body:
   ```json
   {
     "email": "testuser@example.com",
     "password": "Password@123"
   }
   ```
   - Update `token` variable from `data.accessToken`.

4. Add auth header for protected calls:
   - `Authorization: Bearer {{token}}`

5. `GET /api/wallet/balance`
6. `POST /api/payment/create-order` (Razorpay or mock)
   - Body:
   ```json
   {
     "amount": 5000,
     "paymentGateway": "RAZORPAY",
     "idempotencyKey": "add-money-unique-key-1"
   }
   ```
   - Header: `x-idempotency-key: add-money-unique-key-1`

7. For Razorpay: complete checkout on frontend and call `POST /api/payment/verify`.

8. Create second user similarly, then transfer:
   - `POST /api/wallet/transfer`
   - Body:
   ```json
   {
     "receiverEmail": "seconduser@example.com",
     "amount": 500,
     "description": "test transfer",
     "idempotencyKey": "transfer-unique-key-1"
   }
   ```
   - Header: `x-idempotency-key: transfer-unique-key-1`

9. `GET /api/wallet/transactions`
10. `GET /api/wallet/stats`
11. `GET /api/wallet/analytics`

Suggested Postman variables:
- `baseUrl = http://localhost:5000`
- `token = <jwt access token>`

## Scripts

### Backend
- `npm run dev` - nodemon server
- `npm start` - node server
- `npm test` - jest

Current backend test suites:
- `authController.test.js`
- `walletController.test.js`
- `paymentController.test.js`

### Frontend
- `npm start` - dev server
- `npm run build` - production build
- `npm test` - test runner

## Docker Setup

Run full application using Docker:

```bash
docker-compose up --build
```

Services:
- Backend: Node.js API (port 5000)
- Frontend: React app via Nginx (port 3000)
- MongoDB: Database container (port 27017)
- Backend healthcheck: `GET /api/health` (used by Docker healthcheck)

Access URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

Docker files included:
- `backend/Dockerfile`
- `backend/.dockerignore`
- `frontend/Dockerfile`
- `frontend/.dockerignore`
- `frontend/nginx.conf`
- `docker-compose.yml`

Important backend env for Docker Compose:

```env
MONGODB_URI=mongodb://mongo:27017/digital-wallet
```

Notes:
- Keep `.env` local only (never commit).
- Keep `.env.example` committed as template.
- `docker-compose.yml` uses conditional `depends_on` for startup ordering.
- Backend Docker image is optimized with multi-stage build and runs as non-root user.

## CI/CD Setup

GitHub Actions workflow file:
- `.github/workflows/ci-cd.yml`

Pipeline trigger:
- `push` to `main`

Pipeline actions:
- Checkout repository
- Setup Node.js 18
- Install backend dependencies
- Run backend tests
- Build backend and frontend Docker images
- Login to Docker Hub
- Push Docker images

Required GitHub Secrets:
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

## Production Checklist (Before DevOps)

- Add frontend test coverage (component/integration tests).
- Add backend integration tests (DB-backed tests for transfer and webhook race conditions).
- Add alerting/monitoring sinks for logs (ELK, CloudWatch, or Grafana stack).

## Test Scenarios

### Authentication
- User registration with valid details
- OTP verification success and failure
- Login with correct and incorrect credentials
- Refresh token flow

### Wallet
- Fetch wallet balance
- Transfer money between users
- Prevent transfer with insufficient balance

### Payment
- Create Razorpay order
- Successful payment verification
- Failed/invalid signature verification
- Webhook reconciliation

### Idempotency
- Prevent duplicate transfer requests
- Prevent duplicate add-money requests

### Analytics
- Fetch monthly transaction summary
- Fetch top receivers

## Detailed Test Cases

### Authentication

| Test Case | Input | Expected Output |
|---|---|---|
| Register valid user | Valid email/password | Success response |
| Register duplicate email | Existing email | Error |
| Login valid | Correct credentials | JWT token |
| Login invalid | Wrong password | Error |
| OTP valid | Correct OTP | Verified |
| OTP invalid | Wrong OTP | Error |

### Payment (Razorpay)

| Test Case | Input | Expected Output |
|---|---|---|
| Create order | Valid amount | Order created |
| Verify payment valid | Correct signature | Wallet updated |
| Verify payment invalid | Wrong signature | Rejected |
| Duplicate verify | Same idempotency key | No duplicate credit |

### Wallet Transfer

| Test Case | Input | Expected Output |
|---|---|---|
| Valid transfer | Sufficient balance | Success |
| Insufficient balance | Low balance | Error |
| Invalid receiver | Wrong email | Error |
| Duplicate transfer | Same idempotency key | Single transaction |

### Analytics

| Test Case | Input | Expected Output |
|---|---|---|
| Fetch analytics | Valid user | Data returned |
| No transactions | Empty data | Default values |

## Edge Cases

### Wallet / Payments
- Double-click on Pay button
- Network retry causing duplicate request
- Payment success but verify API fails
- Webhook arrives before verify API
- Webhook arrives twice

### Authentication
- Expired JWT token
- Refresh token reuse (attack scenario)
- Invalid OTP attempts multiple times

### Concurrency
- Two transfers at same time
- Transfer plus add money simultaneously

### Data Integrity
- Negative amount input
- Large amount overflow
- Self-transfer (user sending to self)

## Failure Handling

- All wallet operations use MongoDB transactions to ensure atomicity
- Idempotency keys prevent duplicate financial operations
- Payment verification ensures wallet updates only after signature validation
- Webhook reconciliation ensures eventual consistency between payment gateway and wallet state

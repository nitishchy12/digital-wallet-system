# Digital Wallet (MERN)

A full-stack digital wallet project with authentication, OTP verification, wallet transfers, transaction history, QR scan/pay flow, and admin endpoints.

## Current Project Status

- Frontend and backend both build and run.
- Payment supports **real Razorpay flow** (order create + signature verify + wallet update in transaction) and mock mode for local testing.
- Backend is hardened with stricter validation, structured logging, global error handling, and atomic wallet operations.
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

## Production Checklist (Before DevOps)

- Add Razorpay webhook verification for reconciliation and dispute-safe settlement.
- Add more API and integration tests (auth, wallet, payment verify).
- Add refresh-token storage hardening (hash refresh token in DB).
- Add alerting/monitoring sinks for logs (ELK, CloudWatch, or Grafana stack).

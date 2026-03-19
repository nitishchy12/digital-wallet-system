# Digital Wallet (MERN)

A full-stack digital wallet project with authentication, OTP verification, wallet transfers, transaction history, QR scan/pay flow, and admin endpoints.

## Current Project Status

- Frontend and backend both build and run.
- Payment flow is currently **mocked** (no live Razorpay/Stripe charge in this code path).
- Frontend route flow follows:
  - `/signup`
  - `/signin`
  - `/dashboard`
  - `/send`
- Legacy frontend routes are redirected for compatibility (`/login`, `/register`, `/send-money`).

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
- Nodemailer

## Project Structure

```text
PatymProject/
  backend/
    controllers/
    middleware/
    models/
    routes/
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
- `/add-money` - Add money (mock)
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
- `GET /api/wallet/transactions`
- `GET /api/wallet/search-users`
- `POST /api/wallet/transfer`

### Payment (Mock mode)
- `GET /api/payment/methods`
- `POST /api/payment/create-order`
- `POST /api/payment/verify`
- `POST /api/payment/webhook`

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
     "password": "Password1"
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
     "password": "Password1"
   }
   ```
   - Update `token` variable from `data.accessToken`.

4. Add auth header for protected calls:
   - `Authorization: Bearer {{token}}`

5. `GET /api/wallet/balance`
6. `POST /api/payment/create-order` (mock add money)
   - Body:
   ```json
   {
     "amount": 5000,
     "paymentGateway": "MOCK"
   }
   ```

7. Create second user similarly, then transfer:
   - `POST /api/wallet/transfer`
   - Body:
   ```json
   {
     "receiverEmail": "seconduser@example.com",
     "amount": 500,
     "description": "test transfer"
   }
   ```

8. `GET /api/wallet/transactions`
9. `GET /api/wallet/stats`

Suggested Postman variables:
- `baseUrl = http://localhost:5000`
- `token = <jwt access token>`

## Scripts

### Backend
- `npm run dev` - nodemon server
- `npm start` - node server
- `npm test` - jest

### Frontend
- `npm start` - dev server
- `npm run build` - production build
- `npm test` - test runner

## Notes

- If your backend `.env` still has `mongo:27017` from Docker setup, server has a fallback to localhost in current code.
- Keep strong JWT secrets for production.
- Replace mock payment flow with real gateway logic before production use.

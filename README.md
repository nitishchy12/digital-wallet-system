# 💰 Digital Wallet – MERN Stack Application

A production-ready Digital Wallet application built using the MERN stack, following clean architecture and senior-level engineering practices.

---

## 🚀 Features

- User Registration with Email OTP Verification
- Secure Authentication using JWT
- Wallet Management (Single Source of Truth)
- Money Transfer Between Users
- Transaction History with Filtering
- Real-time Notifications (Socket.IO)
- QR Code Generation & Scanning
- Mock Payment Gateway Integration
- Admin-ready Architecture

---

## 📋 Prerequisites

- Node.js (v14+)
- MongoDB (v4+)
- npm or yarn

---

## 🛠️ Complete Project Setup (Backend + Frontend)

### Clone the Repository
```bash
git clone <your-github-repo-url>
cd PatymProject
Backend Setup
cd backend
npm install
npm run dev
Create a .env file inside the backend/ directory and add:

MONGODB_URI=mongodb://localhost:27017/digital-wallet
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRE=30m
FRONTEND_URL=http://localhost:3000
PORT=5000
Frontend Setup
cd frontend
npm install
npm start
Frontend will run on: http://localhost:3000
Backend will run on: http://localhost:5000

📚 API Overview
Authentication
POST /api/auth/register

POST /api/auth/verify-otp

POST /api/auth/login

POST /api/auth/logout

Wallet & Transactions
GET /api/wallet/balance

POST /api/wallet/transfer

GET /api/transactions

🧪 Complete Testing Flow
Register a user

Verify OTP from email

Login

Add money (Mock Payment)

Send money to another user

Generate QR Code

Scan QR Code and transfer money

View transaction history

Logout

🔐 Security Features
Password hashing

JWT-based authentication

OTP attempt limiting

Rate limiting

Input validation

CORS & Helmet protection

🏗️ Tech Stack
Frontend
React

Context API

Axios

React Router

Tailwind CSS

Backend
Node.js

Express.js

MongoDB

Mongoose

Socket.IO

📝 License
MIT

👨‍💻 Author
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transaction');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1);
const server = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Socket.io
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});
global.io = io;

// Middleware
app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
}));

// Auth rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts. Try later."
});

// MongoDB
const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/digital-wallet';

const connectMongoDB = async () => {
  const configuredUri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

  try {
    await mongoose.connect(configuredUri);
    console.log(`MongoDB connected successfully: ${configuredUri}`);
    return;
  } catch (error) {
    const shouldFallbackToLocalhost =
      configuredUri.includes('mongo:27017') &&
      (error?.name === 'MongooseServerSelectionError' || error?.code === 'ENOTFOUND');

    if (!shouldFallbackToLocalhost) {
      console.error('MongoDB connection error:', error);
      return;
    }

    console.warn(
      `MongoDB host "mongo" was not reachable. Retrying with local MongoDB URI: ${DEFAULT_MONGODB_URI}`
    );

    try {
      await mongoose.connect(DEFAULT_MONGODB_URI);
      console.log(`MongoDB connected successfully: ${DEFAULT_MONGODB_URI}`);
    } catch (fallbackError) {
      console.error('MongoDB connection error:', fallbackError);
    }
  }
};

connectMongoDB();

// Socket events
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('👤 User disconnected:', socket.id);
  });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Health
app.get('/api/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404
app.use('*', (_, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
});


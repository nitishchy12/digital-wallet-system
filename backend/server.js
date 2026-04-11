const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transaction');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);
const server = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});
global.io = io;

app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      if (req.originalUrl === '/api/payment/webhook') {
        req.rawBody = buf.toString('utf8');
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Try again later.' }
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try later.' }
});

const DEFAULT_MONGODB_URIS = {
  development: 'mongodb://localhost:27017/digital-wallet',
  production: 'mongodb://mongo:27017/digital-wallet'
};

const resolveMongoUri = () => {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  return process.env.NODE_ENV === 'production'
    ? DEFAULT_MONGODB_URIS.production
    : DEFAULT_MONGODB_URIS.development;
};

const connectMongoDB = async () => {
  const configuredUri = resolveMongoUri();

  try {
    await mongoose.connect(configuredUri);
    logger.info('MongoDB connected successfully: %s', configuredUri);
  } catch (error) {
    logger.error('MongoDB connection error: %s', error.message);
    throw error;
  }
};

connectMongoDB().catch((error) => {
  logger.error('Failed to connect MongoDB: %s', error.message);
  process.exit(1);
});

io.on('connection', (socket) => {
  logger.info('Socket connected: %s', socket.id);

  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
  });

  socket.on('disconnect', () => {
    logger.info('Socket disconnected: %s', socket.id);
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info('Server running on port %s', PORT);
});

module.exports = { app, server };

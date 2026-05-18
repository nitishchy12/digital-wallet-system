require('dotenv').config();
const validateEnv = require('./utils/validateEnv');
validateEnv();

const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transaction');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');
const disputeRoutes = require('./routes/dispute');
const healthRoutes = require('./routes/health');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { loginLimiter, registerLimiter, transferLimiter, authLimiter, globalLimiter } = require('./middleware/rateLimiter');

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

// Global rate limit: 200 req / 15 min per IP (Redis sliding window)
app.use(globalLimiter);

const DEFAULT_MONGODB_URIS = {
  development: 'mongodb://localhost:27017/digital-wallet',
  production: 'mongodb://mongo:27017/digital-wallet'
};

const isRunningInDocker = () =>
  process.env.RUNNING_IN_DOCKER === 'true' || fs.existsSync('/.dockerenv');

const resolveMongoUri = () => {
  const configuredUri =
    process.env.MONGODB_URI ||
    (process.env.NODE_ENV === 'production'
      ? DEFAULT_MONGODB_URIS.production
      : DEFAULT_MONGODB_URIS.development);

  // If Docker hostname is present during a normal local run, switch cleanly to localhost.
  if (!isRunningInDocker() && configuredUri.includes('mongo:27017')) {
    return configuredUri.replace('mongo:27017', 'localhost:27017');
  }

  return configuredUri;
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
app.use('/api/audit', auditRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/scheduled-transfers', require('./routes/scheduled'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Only bind the port when this file is run directly (node server.js).
// When required by tests, supertest binds its own ephemeral port.
if (require.main === module) {
  server.listen(PORT, () => {
    logger.info('Server running on port %s', PORT);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // Kubernetes sends SIGTERM, waits terminationGracePeriodSeconds (default 30s),
  // then force-kills with SIGKILL. We use that window to drain in-flight requests.

  const gracefulShutdown = async (signal) => {
    logger.info('%s received — starting graceful shutdown', signal);

    // Stop accepting new connections immediately
    server.close(async () => {
      logger.info('HTTP server closed — no new connections accepted');

      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');

        const { getRedisClient } = require('./utils/redis');
        await getRedisClient().quit().catch(() => {});
        logger.info('Redis connection closed');

        logger.info('Graceful shutdown complete — exiting with code 0');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown cleanup: %s', err.message);
        process.exit(1);
      }
    });

    // Force exit after 30 seconds if connections don't drain
    setTimeout(() => {
      logger.error('Shutdown timeout after 30s — forcing exit');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
}

// ── Process-level safety nets (active in all modes including tests) ──────────
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection: %s', reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception: %s', err.stack);
  process.exit(1);
});

module.exports = { app, server };

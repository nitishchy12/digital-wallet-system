// Purpose: BullMQ consumer — processes notification jobs (email + socket)
// Dependencies: bullmq, emailService, redis
// Used by: run as separate process: node backend/workers/notificationWorker.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../utils/redis');
const {
  sendTransferSentEmail,
  sendMoneyReceivedEmail,
  sendPaymentSuccessEmail,
  sendLowBalanceEmail,
  sendDisputeRaisedEmail
} = require('../utils/emailService');

const connection = createBullMQConnection();

// ── Job handlers — one per notification type ─────────────────────────────────

const handlers = {
  TRANSFER_SENT: async (payload) => {
    await sendTransferSentEmail({
      to: payload.senderEmail,
      senderName: payload.senderName,
      receiverName: payload.receiverName,
      amount: payload.amount,
      transactionId: payload.transactionId,
      newBalance: payload.senderNewBalance
    });
  },

  MONEY_RECEIVED: async (payload) => {
    await sendMoneyReceivedEmail({
      to: payload.receiverEmail,
      senderName: payload.senderName,
      receiverName: payload.receiverName,
      amount: payload.amount,
      transactionId: payload.transactionId,
      newBalance: payload.receiverNewBalance
    });
  },

  PAYMENT_SUCCESS: async (payload) => {
    await sendPaymentSuccessEmail({
      to: payload.userEmail,
      userName: payload.userName,
      amount: payload.amount,
      transactionId: payload.transactionId,
      newBalance: payload.newBalance
    });
  },

  LOW_BALANCE_ALERT: async (payload) => {
    await sendLowBalanceEmail({
      to: payload.userEmail,
      userName: payload.userName,
      currentBalance: payload.currentBalance,
      threshold: payload.threshold
    });
  },

  DISPUTE_RAISED: async (payload) => {
    await sendDisputeRaisedEmail({
      to: payload.userEmail,
      userName: payload.userName,
      transactionId: payload.transactionId,
      amount: payload.amount
    });
  }
};

// ── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker(
  'notifications',
  async (job) => {
    const handler = handlers[job.name];

    if (!handler) {
      console.warn(`[worker] Unknown notification type: ${job.name} — skipping`);
      return;
    }

    console.log(`[worker] Processing job=${job.id} type=${job.name} attempt=${job.attemptsMade + 1}`);
    await handler(job.data);
  },
  {
    connection,
    concurrency: 5  // process up to 5 jobs in parallel
  }
);

worker.on('completed', (job) => {
  console.log(`[worker] Completed job=${job.id} type=${job.name}`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] Failed job=${job.id} type=${job.name} attempts=${job.attemptsMade}: ${err.message}`);
  if (job.attemptsMade >= job.opts.attempts) {
    console.error(`[worker] Job=${job.id} moved to failed set after ${job.opts.attempts} attempts`);
  }
});

worker.on('error', (err) => {
  console.error('[worker] Worker-level error:', err.message);
});

console.log('[worker] Notification worker started — waiting for jobs...');

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const shutdown = async (signal) => {
  console.log(`[worker] Received ${signal} — shutting down gracefully`);
  await worker.close();
  connection.disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

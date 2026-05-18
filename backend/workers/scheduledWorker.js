// Purpose: Executes scheduled transfers when their BullMQ delay fires
// Dependencies: ScheduledTransfer, Wallet, User, Transaction models, BullMQ
// Used by: run as separate process — node backend/workers/scheduledWorker.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { createBullMQConnection, getRedisClient } = require('../utils/redis');
const ScheduledTransfer = require('../models/ScheduledTransfer');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { acquireLock, releaseLock } = require('../utils/distributedLock');
const { invalidateMany } = require('../utils/balanceCache');
const { enqueueNotification } = require('../utils/notificationQueue');
const { scheduleTransferJob } = require('../queues/scheduledQueue');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/digital-wallet');
  console.log('[scheduledWorker] MongoDB connected');
};

connectDB().catch((err) => {
  console.error('[scheduledWorker] MongoDB connection failed:', err.message);
  process.exit(1);
});

const worker = new Worker(
  'scheduled-transfers',
  async (job) => {
    const { scheduledTransferId } = job.data;

    const scheduled = await ScheduledTransfer.findById(scheduledTransferId);
    if (!scheduled || scheduled.status === 'cancelled') {
      console.log(`[scheduledWorker] Job skipped — status=${scheduled?.status}`);
      return { skipped: true };
    }

    await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, { status: 'processing' });

    const [sender, receiver] = await Promise.all([
      User.findById(scheduled.userId).select('name email'),
      User.findOne({ email: scheduled.receiverEmail, isVerified: true, isActive: true }).select('_id name email')
    ]);

    if (!receiver) {
      await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, {
        status: 'failed', failureReason: 'Receiver not found or not verified'
      });
      return;
    }

    const senderWallet   = await Wallet.findOne({ userId: scheduled.userId });
    const receiverWallet = await Wallet.findOne({ userId: receiver._id });

    if (!senderWallet || !receiverWallet) {
      await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, {
        status: 'failed', failureReason: 'Wallet not found'
      });
      return;
    }

    const effectiveBalance = senderWallet.balance - (senderWallet.escrowHeld || 0);
    if (effectiveBalance < scheduled.amount) {
      await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, {
        status: 'failed', failureReason: 'Insufficient funds'
      });
      if (sender) {
        await enqueueNotification('LOW_BALANCE_ALERT', {
          userEmail: sender.email, userName: sender.name,
          currentBalance: effectiveBalance, threshold: scheduled.amount
        });
      }
      return;
    }

    // Acquire distributed lock on sender wallet key
    const redis = getRedisClient();
    const lockKey = `wallet:${scheduled.userId}`;
    let lockToken = null;

    try {
      lockToken = await acquireLock(redis, lockKey);
    } catch (lockErr) {
      await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, {
        status: 'failed', failureReason: `Lock contention: ${lockErr.message}`
      });
      throw lockErr; // Let BullMQ retry
    }

    try {
      // Atomic debit + credit — same pattern as the main transfer controller
      await Wallet.findByIdAndUpdate(senderWallet._id, { $inc: { balance: -scheduled.amount } });
      await Wallet.findByIdAndUpdate(receiverWallet._id, { $inc: { balance: scheduled.amount } });

      const txn = await Transaction.create({
        transactionId: crypto.randomBytes(12).toString('hex'),
        senderId: scheduled.userId,          // User ObjectId (matches Transaction schema)
        receiverId: receiver._id,            // User ObjectId
        amount: scheduled.amount,
        type: 'TRANSFER',
        status: 'SUCCESS',
        paymentGateway: 'INTERNAL',
        description: scheduled.description || 'Scheduled transfer',
        processedAt: new Date(),
        idempotencyKey: `scheduled-${scheduledTransferId}-exec-${scheduled.executionCount + 1}`
      });

      // Invalidate both wallet caches by User ID (as balanceCache.js expects)
      await invalidateMany([scheduled.userId.toString(), receiver._id.toString()]);

      await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, {
        status: scheduled.recurring ? 'pending' : 'completed',
        lastExecutedAt: new Date(),
        $inc: { executionCount: 1 }
      });

      if (sender) {
        await enqueueNotification('TRANSFER_SENT', {
          senderEmail: sender.email, senderName: sender.name,
          receiverName: receiver.name, amount: scheduled.amount,
          transactionId: txn.transactionId, senderNewBalance: senderWallet.balance - scheduled.amount
        });
      }

      // Reschedule if recurring
      if (scheduled.recurring && scheduled.recurringIntervalDays) {
        const nextRun = new Date(Date.now() + scheduled.recurringIntervalDays * 24 * 60 * 60 * 1000);
        const newJobId = await scheduleTransferJob(scheduledTransferId, nextRun);
        await ScheduledTransfer.findByIdAndUpdate(scheduledTransferId, {
          scheduledAt: nextRun, bullmqJobId: newJobId
        });
      }

      console.log(`[scheduledWorker] Executed scheduled transfer ${scheduledTransferId} txn=${txn.transactionId}`);
    } finally {
      await releaseLock(redis, lockKey, lockToken);
    }
  },
  { connection: createBullMQConnection(), concurrency: 3 }
);

worker.on('completed', (job) => console.log(`[scheduledWorker] Job ${job.id} completed`));
worker.on('failed', async (job, err) => {
  console.error(`[scheduledWorker] Job ${job.id} failed:`, err.message);
  await ScheduledTransfer.findByIdAndUpdate(job.data.scheduledTransferId, {
    status: 'failed', failureReason: err.message
  }).catch(() => {});
});
worker.on('error', (err) => console.error('[scheduledWorker] Worker error:', err.message));

process.on('SIGTERM', async () => {
  console.log('[scheduledWorker] Shutting down...');
  await worker.close();
  process.exit(0);
});

console.log('[scheduledWorker] Started — waiting for scheduled jobs...');

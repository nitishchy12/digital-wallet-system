const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { enqueueNotification } = require('../utils/notificationQueue');
const { writeAuditLog } = require('../utils/auditLogger');
const { checkPerTransferLimit, checkDailyLimit, getLimitsForTier } = require('../utils/kycLimits');
const { acquireLock, releaseLock } = require('../utils/distributedLock');
const { getRedisClient } = require('../utils/redis');
const { getBalance, setBalance, invalidateMany } = require('../utils/balanceCache');
const LedgerEntry = require('../models/LedgerEntry');

const getIdempotencyKey = (req) => {
  const headerKey = req.headers?.['x-idempotency-key'];
  const bodyKey = req.body?.idempotencyKey;
  const key = (headerKey || bodyKey || '').toString().trim();
  return key || null;
};

// Rolling 24h spend — shared by the real enforcement check in transferMoney
// and the display-only figure in getWalletBalance, so they can never drift.
const getAlreadySpentToday = async (senderId) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dailyAgg = await Transaction.aggregate([
    {
      $match: {
        senderId,
        type: 'TRANSFER',
        status: 'SUCCESS',
        createdAt: { $gte: oneDayAgo }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return dailyAgg[0]?.total || 0;
};

// ---------------------------------------------------------------------------
// Helper: start a Mongoose session + transaction.
// Falls back gracefully if the MongoDB deployment doesn't support transactions
// (e.g. standalone / local dev without a replica set).
// ---------------------------------------------------------------------------
const startSessionSafe = async () => {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    return { session, useTransaction: true };
  } catch (err) {
    // Code 20 = "Transaction numbers are only allowed on a replica set member or mongos"
    // Code 51 = "The given transaction number is incompatible with the existing transaction"
    const isNoReplicaSet =
      err.codeName === 'IllegalOperation' ||
      err.code === 20 ||
      err.code === 51 ||
      /transaction/i.test(err.message);

    if (isNoReplicaSet) {
      logger.warn('MongoDB transactions not supported — falling back to non-transactional mode');
      return { session: null, useTransaction: false };
    }
    throw err;
  }
};

// Safe commit helper
const commitSafe = async (session, useTransaction) => {
  if (useTransaction && session) {
    await session.commitTransaction();
    session.endSession();
  }
};

// Safe abort helper — never throws even if session is in a bad state
const abortSafe = async (session, useTransaction) => {
  if (!useTransaction || !session) return;
  try {
    await session.abortTransaction();
  } catch (_) {
    // ignore abort errors
  } finally {
    try {
      session.endSession();
    } catch (_) {
      // ignore
    }
  }
};

// Session option helper
const sessionOpt = (session, useTransaction) =>
  useTransaction && session ? { session } : {};

// ---------------------------------------------------------------------------

const getWalletBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // escrowHeld changes via the dispute flow, not the balance cache's
    // invalidation path, so it's always read fresh rather than cached.
    const escrowHeld = (await Wallet.findOne({ userId }).select('escrowHeld'))?.escrowHeld || 0;

    const kycTier = req.user.kycTier ?? 0;
    const limits = getLimitsForTier(kycTier);
    const alreadySpentToday = await getAlreadySpentToday(userId);
    const limitInfo = {
      kycTier,
      perTransferLimit: limits.perTransferLimit,
      dailyLimit: limits.dailyLimit,
      alreadySpentToday,
      remainingToday: Math.max(0, limits.dailyLimit - alreadySpentToday)
    };

    // ── Cache-aside: serve from Redis if fresh ─────────────────────────────
    const cached = await getBalance(userId);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: {
          balance: cached.balance,
          formattedBalance: `Rs ${cached.balance.toLocaleString('en-IN')}`,
          currency: 'INR',
          escrowHeld,
          effectiveBalance: cached.balance - escrowHeld,
          ...limitInfo
        }
      });
    }

    // ── Cache miss: read from MongoDB, then populate cache ─────────────────
    let wallet;
    try {
      wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balance: 0, currency: 'INR' } },
        { new: true, upsert: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        wallet = await Wallet.findOne({ userId });
      } else {
        throw error;
      }
    }

    await setBalance(userId, wallet.balance);

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        formattedBalance: `Rs ${wallet.balance.toLocaleString('en-IN')}`,
        currency: wallet.currency,
        escrowHeld: wallet.escrowHeld || 0,
        effectiveBalance: wallet.balance - (wallet.escrowHeld || 0),
        ...limitInfo
      }
    });
  } catch (error) {
    return next(error);
  }
};

const transferMoney = async (req, res, next) => {
  const { receiverEmail, description } = req.body;
  const amount = Number(req.body.amount);
  const senderId = req.user._id;
  const idempotencyKey = getIdempotencyKey(req);

  // ── Step 1: Idempotency check — before touching anything else ──────────
  if (idempotencyKey) {
    const existing = await Transaction.findOne({
      idempotencyUserId: senderId,
      idempotencyKey,
      type: 'TRANSFER'
    }).populate('receiverId', 'name email');

    if (existing?.status === 'SUCCESS') {
      const senderWallet = await Wallet.findOne({ userId: senderId }).select('balance');
      return res.status(200).json({
        success: true,
        message: 'Transfer already processed for this request',
        data: {
          transaction: existing,
          senderBalance: senderWallet?.balance || 0,
          receiver: { name: existing.receiverId?.name, email: existing.receiverId?.email }
        }
      });
    }

    if (existing?.status === 'PENDING') {
      return res.status(409).json({
        success: false,
        error: 'TRANSFER_IN_PROGRESS',
        message: 'A transfer is already in progress for this request'
      });
    }
  }

  // ── Step 2: Wallet status + escrow check ───────────────────────────────
  // Fetching balance + escrowHeld here lets us give a descriptive INSUFFICIENT_FUNDS
  // error before acquiring the lock (fast fail path).
  const senderWalletStatus = await Wallet.findOne({ userId: senderId })
    .select('status frozenReason balance escrowHeld');

  if (!senderWalletStatus) {
    return res.status(404).json({ success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found' });
  }

  if (senderWalletStatus.status === 'frozen') {
    await writeAuditLog({
      action: 'TRANSFER_FAILED',
      userId: senderId,
      req,
      metadata: { reason: 'WALLET_FROZEN', amount, receiverEmail },
      severity: 'warning'
    });
    return res.status(403).json({
      success: false,
      error: 'WALLET_FROZEN',
      message: 'Your wallet has been frozen. Please contact support.',
      reason: senderWalletStatus.frozenReason
    });
  }

  if (senderWalletStatus.status === 'suspended') {
    return res.status(403).json({
      success: false,
      error: 'WALLET_SUSPENDED',
      message: 'Your wallet has been suspended. Please contact support.'
    });
  }

  // Early effective-balance check — accounts for amounts locked in escrow.
  // The atomic debit inside the lock re-checks with $expr for safety.
  const escrowHeld = senderWalletStatus.escrowHeld || 0;
  const effectiveBalance = senderWalletStatus.balance - escrowHeld;
  if (effectiveBalance < amount) {
    await writeAuditLog({
      action: 'TRANSFER_FAILED',
      userId: senderId,
      req,
      metadata: { amount, receiverEmail, reason: 'INSUFFICIENT_FUNDS', balance: senderWalletStatus.balance, escrowHeld },
      severity: 'warning'
    });
    return res.status(400).json({
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: `Insufficient funds. Available: Rs ${effectiveBalance.toLocaleString('en-IN')}${escrowHeld > 0 ? ` (Rs ${escrowHeld.toLocaleString('en-IN')} held in escrow)` : ''}.`
    });
  }

  // ── Step 3: KYC per-transfer limit ─────────────────────────────────────
  const senderUser = await User.findById(senderId).select('kycTier');
  const tierCheck = checkPerTransferLimit(senderUser?.kycTier ?? 0, amount);
  if (!tierCheck.allowed) {
    return res.status(403).json({ success: false, ...tierCheck });
  }

  // ── Step 4: Daily spending limit (rolling 24h aggregation) ─────────────
  const alreadySpentToday = await getAlreadySpentToday(senderId);
  const dailyCheck = checkDailyLimit(senderUser?.kycTier ?? 0, alreadySpentToday, amount);
  if (!dailyCheck.allowed) {
    return res.status(403).json({ success: false, ...dailyCheck });
  }

  // ── Step 5: Acquire Redis distributed lock on sender wallet ────────────
  // This ensures only one transfer can run for a given sender at a time.
  // If Redis is unavailable we fall through — the atomic $inc still prevents
  // negative balance, but the lock gives us a stronger ordering guarantee.
  const redis = getRedisClient();
  const lockKey = `wallet:${senderId}`;
  let lockToken = null;

  try {
    lockToken = await acquireLock(redis, lockKey);
  } catch (lockErr) {
    if (lockErr.code === 'LOCK_CONTENTION') {
      // Redis is working but the key is held by another in-flight transfer
      return res.status(409).json({
        success: false,
        error: 'LOCK_CONTENTION',
        message: lockErr.message
      });
    }
    // Redis is unreachable — log and continue without lock.
    // The atomic $inc with $gte guard still prevents negative balance.
    logger.warn('Redis unavailable for lock — proceeding without distributed lock: %s', lockErr.message);
    lockToken = null;
  }

  // ── Step 3: Run the transfer inside a retry loop ───────────────────────
  const isTransactionUnsupportedError = (err) =>
    Boolean(
      err &&
        (err.codeName === 'IllegalOperation' ||
          err.code === 20 ||
          err.code === 51 ||
          /transaction numbers are only allowed on a replica set member or mongos/i.test(err.message) ||
          /transaction/i.test(err.message))
    );

  let attempt = 0;
  let forceNoTransaction = false;

  while (attempt < 2) {
    attempt++;
    const { session, useTransaction } = forceNoTransaction
      ? { session: null, useTransaction: false }
      : await startSessionSafe();

    try {
      // ── Double-checked locking: re-verify idempotency INSIDE the lock ──
      // A concurrent request may have passed the outer check (no transaction
      // found yet) and is now waiting here. Re-check to avoid double-debit.
      if (idempotencyKey) {
        const existingInner = await Transaction.findOne({
          idempotencyUserId: senderId,
          idempotencyKey,
          type: 'TRANSFER'
        }).populate('receiverId', 'name email');

        if (existingInner?.status === 'SUCCESS') {
          await abortSafe(session, useTransaction);
          await releaseLock(redis, lockKey, lockToken);
          const senderWalletNow = await Wallet.findOne({ userId: senderId }).select('balance');
          return res.status(200).json({
            success: true,
            message: 'Transfer already processed for this request',
            data: {
              transactionId: existingInner._id,
              transaction: existingInner,
              senderBalance: senderWalletNow?.balance || 0,
              receiver: { name: existingInner.receiverId?.name, email: existingInner.receiverId?.email }
            }
          });
        }
      }

      const receiver = await User.findOne({ email: receiverEmail })
        .select('_id name email isVerified isActive notificationPreferences');

      if (!receiver) {
        await abortSafe(session, useTransaction);
        await releaseLock(redis, lockKey, lockToken);
        return res.status(404).json({ success: false, error: 'RECEIVER_NOT_FOUND', message: 'Receiver not found' });
      }

      if (!receiver.isVerified || !receiver.isActive) {
        await abortSafe(session, useTransaction);
        await releaseLock(redis, lockKey, lockToken);
        return res.status(400).json({ success: false, error: 'RECEIVER_INELIGIBLE', message: 'Receiver account is not eligible to receive payments' });
      }

      if (receiver._id.toString() === senderId.toString()) {
        await abortSafe(session, useTransaction);
        await releaseLock(redis, lockKey, lockToken);
        return res.status(400).json({ success: false, error: 'SELF_TRANSFER', message: 'Cannot transfer money to yourself' });
      }

      // Ensure both wallets exist
      await Wallet.updateOne(
        { userId: senderId },
        { $setOnInsert: { userId: senderId, balance: 0, currency: 'INR' } },
        { upsert: true, ...sessionOpt(session, useTransaction) }
      );
      await Wallet.updateOne(
        { userId: receiver._id },
        { $setOnInsert: { userId: receiver._id, balance: 0, currency: 'INR' } },
        { upsert: true, ...sessionOpt(session, useTransaction) }
      );

      // Atomic debit — only succeeds when (balance - escrowHeld) >= amount
      const debitResult = await Wallet.updateOne(
        {
          userId: senderId,
          $expr: {
            $gte: [{ $subtract: ['$balance', { $ifNull: ['$escrowHeld', 0] }] }, amount]
          }
        },
        { $inc: { balance: -amount } },
        sessionOpt(session, useTransaction)
      );

      if (debitResult.modifiedCount !== 1) {
        await abortSafe(session, useTransaction);
        await releaseLock(redis, lockKey, lockToken);
        const wallet = await Wallet.findOne({ userId: senderId }).select('balance');
        await writeAuditLog({
          action: 'TRANSFER_FAILED',
          userId: senderId,
          req,
          metadata: { amount, receiverEmail, reason: 'INSUFFICIENT_FUNDS', balance: wallet?.balance },
          severity: 'warning'
        });
        return res.status(400).json({
          success: false,
          error: 'INSUFFICIENT_FUNDS',
          message: `Insufficient balance. Your wallet has Rs ${(wallet?.balance || 0).toLocaleString('en-IN')}.`
        });
      }

      // Credit receiver
      await Wallet.updateOne(
        { userId: receiver._id },
        { $inc: { balance: amount } },
        sessionOpt(session, useTransaction)
      );

      // Fetch updated balances
      const [senderWallet, receiverWallet] = await Promise.all([
        Wallet.findOne({ userId: senderId }),
        Wallet.findOne({ userId: receiver._id })
      ]);

      // Write Transaction record
      const [transaction] = await Transaction.create(
        [{
          transactionId: crypto.randomBytes(12).toString('hex'),
          senderId,
          receiverId: receiver._id,
          amount,
          type: 'TRANSFER',
          status: 'SUCCESS',
          description: description || `Transfer to ${receiver.name}`,
          paymentGateway: 'INTERNAL',
          processedAt: new Date(),
          idempotencyKey,
          idempotencyUserId: senderId,
          balanceSnapshot: {
            senderBalance: senderWallet.balance,
            receiverBalance: receiverWallet.balance
          }
        }],
        sessionOpt(session, useTransaction)
      );

      // ── Write double-entry ledger ──────────────────────────────────────
      // senderWallet.balance is post-debit, so balanceBefore = balance + amount
      // receiverWallet.balance is post-credit, so balanceBefore = balance - amount
      await LedgerEntry.create(
        [
          {
            walletId: senderWallet._id,
            transactionId: transaction._id,
            type: 'DEBIT',
            amount,
            balanceBefore: senderWallet.balance + amount,
            balanceAfter:  senderWallet.balance,
            description: description || 'Transfer sent',
            counterpartyWalletId: receiverWallet._id
          },
          {
            walletId: receiverWallet._id,
            transactionId: transaction._id,
            type: 'CREDIT',
            amount,
            balanceBefore: receiverWallet.balance - amount,
            balanceAfter:  receiverWallet.balance,
            description: description || 'Transfer received',
            counterpartyWalletId: senderWallet._id
          }
        ],
        sessionOpt(session, useTransaction)
      );

      await commitSafe(session, useTransaction);

      // ── Invalidate both balance caches before releasing the lock ───────
      await invalidateMany([senderId.toString(), receiver._id.toString()]);

      // ── Audit log — committed, so this is the point of truth ──────────
      await writeAuditLog({
        action: 'TRANSFER_COMPLETED',
        userId: senderId,
        req,
        metadata: {
          transactionId: transaction.transactionId,
          amount,
          receiverId: receiver._id.toString(),
          receiverEmail: receiver.email
        }
      });

      // ── Release lock immediately after commit ──────────────────────────
      await releaseLock(redis, lockKey, lockToken);

      // ── Real-time socket (in-process, synchronous — stays in controller) ──
      if (global.io) {
        if (req.user.notificationPreferences?.TRANSFER_SENT?.inApp ?? true) {
          global.io.to(`user-${senderId}`).emit('transaction-update', {
            type: 'TRANSFER_SENT',
            transaction: transaction.toObject(),
            newBalance: senderWallet.balance
          });
        }
        if (receiver.notificationPreferences?.MONEY_RECEIVED?.inApp ?? true) {
          global.io.to(`user-${receiver._id}`).emit('transaction-update', {
            type: 'MONEY_RECEIVED',
            transaction: transaction.toObject(),
            newBalance: receiverWallet.balance
          });
        }
      }

      // ── Email via BullMQ queue — worker handles delivery asynchronously ──
      // enqueueNotification never throws, so transfer response is never blocked
      await enqueueNotification('TRANSFER_SENT', {
        senderEmail:     req.user.email,
        senderName:      req.user.name,
        receiverName:    receiver.name,
        amount,
        transactionId:   transaction.transactionId,
        senderNewBalance: senderWallet.balance
      });

      await enqueueNotification('MONEY_RECEIVED', {
        receiverEmail:    receiver.email,
        senderName:       req.user.name,
        receiverName:     receiver.name,
        amount,
        transactionId:    transaction.transactionId,
        receiverNewBalance: receiverWallet.balance
      });

      return res.status(200).json({
        success: true,
        message: `Rs ${amount} transferred successfully to ${receiver.name}`,
        data: {
          transactionId: transaction._id,   // MongoDB ObjectId — used by ledger/receipt tests
          transaction,
          senderBalance: senderWallet.balance,
          receiver: { name: receiver.name, email: receiver.email }
        }
      });
    } catch (error) {
      await abortSafe(session, useTransaction);

      if (useTransaction && !forceNoTransaction && isTransactionUnsupportedError(error)) {
        logger.warn('Falling back to non-transactional mode');
        forceNoTransaction = true;
        continue;
      }

      // Always release the lock before propagating the error
      await releaseLock(redis, lockKey, lockToken);
      logger.error('Transfer error senderId=%s amount=%s: %s', senderId, amount, error.message);
      return next(error);
    }
  }

  // Safety net: release lock if the while loop exits without returning
  await releaseLock(redis, lockKey, lockToken);
};

const getTransactionHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const match = {};

    if (req.query.type === 'sent') {
      match.senderId = userId;
    } else if (req.query.type === 'received') {
      match.receiverId = userId;
    } else {
      match.$or = [{ senderId: userId }, { receiverId: userId }];
    }

    if (req.query.startDate || req.query.endDate) {
      match.createdAt = {};

      if (req.query.startDate) {
        match.createdAt.$gte = new Date(req.query.startDate);
      }

      if (req.query.endDate) {
        match.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    if (req.query.minAmount || req.query.maxAmount) {
      match.amount = {};

      if (req.query.minAmount) {
        match.amount.$gte = Number(req.query.minAmount);
      }

      if (req.query.maxAmount) {
        match.amount.$lte = Number(req.query.maxAmount);
      }
    }

    const transactions = await Transaction.find(match)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(match);

    const formatted = transactions.map((tx) => {
      const isReceived = tx.receiverId?._id?.toString() === userId.toString();

      return {
        ...tx.toObject(),
        direction: isReceived ? 'RECEIVED' : 'SENT',
        counterparty: isReceived ? tx.senderId : tx.receiverId,
        formattedAmount: `Rs ${tx.amount.toLocaleString('en-IN')}`
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        transactions: formatted,
        pagination: {
          page,
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          hasNextPage: skip + transactions.length < total,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Transaction history error: %s', error.message);
    return next(error);
  }
};

const getWalletStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    let wallet;

    try {
      wallet = await Wallet.findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            userId,
            balance: 0,
            currency: 'INR'
          }
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        wallet = await Wallet.findOne({ userId });
      } else {
        throw error;
      }
    }

    const [sentAgg, receivedAgg, txCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { senderId: userId, status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { receiverId: userId, status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.countDocuments({ $or: [{ senderId: userId }, { receiverId: userId }] })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        totalTransactions: txCount,
        totalSent: sentAgg[0]?.total || 0,
        totalReceived: receivedAgg[0]?.total || 0,
        formattedBalance: `Rs ${wallet.balance.toLocaleString('en-IN')}`
      }
    });
  } catch (error) {
    logger.error('Wallet stats error: %s', error.message);
    return next(error);
  }
};

const getAnalytics = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const start = new Date();
    start.setMonth(start.getMonth() - 5);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const [monthlySent, monthlyReceived, topReceivers, sentTotalAgg, receivedTotalAgg] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            senderId: userId,
            status: 'SUCCESS',
            createdAt: { $gte: start }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalSent: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Transaction.aggregate([
        {
          $match: {
            receiverId: userId,
            status: 'SUCCESS',
            createdAt: { $gte: start }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalReceived: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Transaction.aggregate([
        {
          $match: {
            senderId: userId,
            status: 'SUCCESS',
            receiverId: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$receiverId',
            totalAmount: { $sum: '$amount' },
            txCount: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 0,
            receiverId: '$user._id',
            name: '$user.name',
            email: '$user.email',
            totalAmount: 1,
            txCount: 1
          }
        }
      ]),
      Transaction.aggregate([
        { $match: { senderId: userId, status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { receiverId: userId, status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const monthMap = new Map();

    for (let i = 0; i < 6; i += 1) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      monthMap.set(key, {
        month: d.toLocaleDateString('en-IN', { month: 'short' }),
        year: d.getFullYear(),
        sent: 0,
        received: 0
      });
    }

    monthlySent.forEach((row) => {
      const key = `${row._id.year}-${row._id.month}`;
      if (monthMap.has(key)) {
        monthMap.get(key).sent = row.totalSent;
      }
    });

    monthlyReceived.forEach((row) => {
      const key = `${row._id.year}-${row._id.month}`;
      if (monthMap.has(key)) {
        monthMap.get(key).received = row.totalReceived;
      }
    });

    const sentTotal = sentTotalAgg[0]?.total || 0;
    const receivedTotal = receivedTotalAgg[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: {
        monthly: Array.from(monthMap.values()),
        sentVsReceived: {
          sent: sentTotal,
          received: receivedTotal
        },
        topReceivers
      }
    });
  } catch (error) {
    logger.error('Wallet analytics error: %s', error.message);
    return next(error);
  }
};

const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user._id;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const users = await User.find({
      _id: { $ne: currentUserId },
      isVerified: true,
      isActive: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    })
      .select('name email')
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: { users }
    });
  } catch (error) {
    logger.error('Search users error: %s', error.message);
    return next(error);
  }
};

const exportTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const match = {};

    if (req.query.type === 'sent') {
      match.senderId = userId;
    } else if (req.query.type === 'received') {
      match.receiverId = userId;
    } else {
      match.$or = [{ senderId: userId }, { receiverId: userId }];
    }

    if (req.query.startDate || req.query.endDate) {
      match.createdAt = {};
      if (req.query.startDate) match.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) match.createdAt.$lte = new Date(req.query.endDate);
    }

    if (req.query.minAmount || req.query.maxAmount) {
      match.amount = {};
      if (req.query.minAmount) match.amount.$gte = Number(req.query.minAmount);
      if (req.query.maxAmount) match.amount.$lte = Number(req.query.maxAmount);
    }

    const transactions = await Transaction.find(match)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email')
      .sort({ createdAt: -1 });

    const headers = ['Date', 'Transaction ID', 'Type', 'Counterparty Name', 'Counterparty Email', 'Amount', 'Status', 'Description'];
    const rows = transactions.map((tx) => {
      const isReceived = tx.receiverId && tx.receiverId._id.toString() === userId.toString();
      const direction = isReceived ? 'RECEIVED' : 'SENT';
      const counterparty = isReceived ? tx.senderId : tx.receiverId;
      
      const typeStr = tx.type === 'ADD_MONEY' ? 'ADD_MONEY' : direction;
      const cpName = counterparty ? counterparty.name : 'N/A';
      const cpEmail = counterparty ? counterparty.email : 'N/A';
      
      const dateStr = new Date(tx.createdAt).toISOString();
      const desc = tx.description ? tx.description.replace(/"/g, '""') : '';
      
      return [
        `"${dateStr}"`,
        `"${tx.transactionId}"`,
        `"${typeStr}"`,
        `"${cpName}"`,
        `"${cpEmail}"`,
        `"${tx.amount}"`,
        `"${tx.status}"`,
        `"${desc}"`
      ].join(',');
    });

    const csvData = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    
    return res.status(200).send(csvData);
  } catch (error) {
    logger.error('Export transactions error: %s', error.message);
    return next(error);
  }
};

const { generateReceipt } = require('../utils/receiptGenerator');

const downloadReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user._id;

    const transaction = await Transaction.findById(transactionId)
      .populate('senderId', 'name')
      .populate('receiverId', 'name');

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' });
    }

    // senderId and receiverId on Transaction are User ObjectIds — compare directly
    const isParty =
      transaction.senderId?._id?.toString() === userId.toString() ||
      transaction.receiverId?._id?.toString() === userId.toString();

    if (!isParty) {
      return res.status(403).json({ success: false, error: 'NOT_AUTHORIZED', message: 'You are not a party to this transaction' });
    }

    const senderName   = transaction.senderId?.name   || 'Unknown';
    const receiverName = transaction.receiverId?.name || 'Unknown';

    const pdfBuffer = await generateReceipt(transaction, senderName, receiverName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${transactionId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error('downloadReceipt error: %s', err.message);
    return next(err);
  }
};

module.exports = {
  getWalletBalance,
  transferMoney,
  getTransactionHistory,
  getWalletStats,
  getAnalytics,
  searchUsers,
  exportTransactions,
  downloadReceipt
};

const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { sendTransactionEmail } = require('../utils/emailService');

const getIdempotencyKey = (req) => {
  const headerKey = req.headers?.['x-idempotency-key'];
  const bodyKey = req.body?.idempotencyKey;
  const key = (headerKey || bodyKey || '').toString().trim();
  return key || null;
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
    let wallet;

    try {
      wallet = await Wallet.findOneAndUpdate(
        { userId: req.user._id },
        {
          $setOnInsert: {
            userId: req.user._id,
            balance: 0,
            currency: 'INR'
          }
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        wallet = await Wallet.findOne({ userId: req.user._id });
      } else {
        throw error;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        formattedBalance: `Rs ${wallet.balance.toLocaleString('en-IN')}`,
        currency: wallet.currency
      }
    });
  } catch (error) {
    return next(error);
  }
};

const transferMoney = async (req, res, next) => {
  // ── 1. Idempotency check BEFORE opening a session ──────────────────────
  const { receiverEmail, description } = req.body;
  const amount = Number(req.body.amount);
  const senderId = req.user._id;
  const idempotencyKey = getIdempotencyKey(req);

  if (idempotencyKey) {
    const existingTransaction = await Transaction.findOne({
      idempotencyUserId: senderId,
      idempotencyKey,
      type: 'TRANSFER'
    })
      .populate('receiverId', 'name email')
      .sort({ createdAt: -1 });

    if (existingTransaction?.status === 'SUCCESS') {
      const senderWallet = await Wallet.findOne({ userId: senderId }).select('balance');

      return res.status(200).json({
        success: true,
        message: 'Transfer already processed for this request',
        data: {
          transaction: existingTransaction,
          senderBalance: senderWallet?.balance || 0,
          receiver: {
            name: existingTransaction.receiverId?.name,
            email: existingTransaction.receiverId?.email
          }
        }
      });
    }

    if (existingTransaction?.status === 'PENDING') {
      return res.status(409).json({
        success: false,
        message: 'A transfer is already in progress for this request'
      });
    }
  }

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
      const receiver = await User.findOne({ email: receiverEmail })
      .select('_id name email isVerified isActive')
      .then((doc) => doc); // no session needed for read

    if (!receiver) {
      await abortSafe(session, useTransaction);
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    if (!receiver.isVerified || !receiver.isActive) {
      await abortSafe(session, useTransaction);
      return res.status(400).json({
        success: false,
        message: 'Receiver account is not eligible to receive payments'
      });
    }

    if (receiver._id.toString() === senderId.toString()) {
      await abortSafe(session, useTransaction);
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer money to yourself'
      });
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

    // Atomic debit — only succeeds when balance >= amount
    const senderDebitResult = await Wallet.updateOne(
      { userId: senderId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      sessionOpt(session, useTransaction)
    );

    if (senderDebitResult.modifiedCount !== 1) {
      await abortSafe(session, useTransaction);
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
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

    // Create transaction record
    const [transaction] = await Transaction.create(
      [
        {
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
        }
      ],
      sessionOpt(session, useTransaction)
    );

    await commitSafe(session, useTransaction);

    // Real-time socket notifications
    if (global.io) {
      global.io.to(`user-${senderId}`).emit('transaction-update', {
        type: 'TRANSFER_SENT',
        transaction: transaction.toObject(),
        newBalance: senderWallet.balance
      });

      global.io.to(`user-${receiver._id}`).emit('transaction-update', {
        type: 'MONEY_RECEIVED',
        transaction: transaction.toObject(),
        newBalance: receiverWallet.balance
      });
    }

    // Fire-and-forget email notifications
    Promise.allSettled([
      sendTransactionEmail(req.user.email, req.user.name, {
        direction: 'SENT',
        amount,
        counterpartyName: receiver.name,
        description: description || 'Wallet transfer',
        balance: senderWallet.balance,
        transactionId: transaction.transactionId
      }),
      sendTransactionEmail(receiver.email, receiver.name, {
        direction: 'RECEIVED',
        amount,
        counterpartyName: req.user.name,
        description: description || 'Wallet transfer',
        balance: receiverWallet.balance,
        transactionId: transaction.transactionId
      })
    ]).catch((error) => {
      logger.warn('Transfer notification dispatch issue: %s', error.message);
    });

    return res.status(200).json({
      success: true,
      message: `Rs ${amount} transferred successfully to ${receiver.name}`,
      data: {
        transaction,
        senderBalance: senderWallet.balance,
        receiver: {
          name: receiver.name,
          email: receiver.email
        }
      }
    });
    } catch (error) {
      await abortSafe(session, useTransaction);

      if (useTransaction && !forceNoTransaction && isTransactionUnsupportedError(error)) {
        logger.warn('Transfer money falling back to non-transactional mode after MongoDB rejected the transaction');
        forceNoTransaction = true;
        continue;
      }

      logger.error('Transfer money error: %s', error.message);
      return next(error);
    }
  }
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

module.exports = {
  getWalletBalance,
  transferMoney,
  getTransactionHistory,
  getWalletStats,
  getAnalytics,
  searchUsers,
  exportTransactions
};

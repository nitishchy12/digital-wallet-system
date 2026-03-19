const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const hasRazorpayConfig = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
const razorpayClient = hasRazorpayConfig
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

const getIdempotencyKey = (req) => {
  const headerKey = req.headers?.['x-idempotency-key'];
  const bodyKey = req.body?.idempotencyKey;
  const key = (headerKey || bodyKey || '').toString().trim();
  return key || null;
};

const createMockAddMoneyTransaction = async ({ userId, amount, paymentGateway, idempotencyKey }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await Wallet.updateOne(
      { userId },
      {
        $setOnInsert: {
          userId,
          currency: 'INR',
          balance: 0
        },
        $inc: { balance: amount }
      },
      { upsert: true, session }
    );

    const wallet = await Wallet.findOne({ userId }).session(session);

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: crypto.randomBytes(12).toString('hex'),
          receiverId: userId,
          amount,
          type: 'ADD_MONEY',
          description: 'Add money to wallet (Mock Payment)',
          paymentGateway,
          status: 'SUCCESS',
          processedAt: new Date(),
          idempotencyKey,
          idempotencyUserId: userId,
          balanceSnapshot: {
            receiverBalance: wallet.balance
          }
        }
      ],
      { session }
    );

    await session.commitTransaction();

    return { transaction, walletBalance: wallet.balance };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const createPaymentOrder = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const paymentGateway = (req.body.paymentGateway || 'MOCK').toUpperCase();
    const userId = req.user._id;
    const idempotencyKey = getIdempotencyKey(req);

    let existingTransaction = null;

    if (idempotencyKey) {
      existingTransaction = await Transaction.findOne({
        idempotencyUserId: userId,
        idempotencyKey,
        type: 'ADD_MONEY'
      }).sort({ createdAt: -1 });
    }

    if (existingTransaction && existingTransaction.status === 'SUCCESS') {
      const wallet = await Wallet.findOne({ userId }).select('balance');

      return res.status(200).json({
        success: true,
        message: 'Payment already processed for this request',
        data: {
          transaction: existingTransaction,
          newBalance: wallet?.balance || 0
        }
      });
    }

    if (paymentGateway === 'MOCK') {
      if (existingTransaction && existingTransaction.status === 'PENDING') {
        return res.status(409).json({
          success: false,
          message: 'Payment already in progress for this request'
        });
      }

      const { transaction, walletBalance } = await createMockAddMoneyTransaction({
        userId,
        amount,
        paymentGateway,
        idempotencyKey
      });

      if (global.io) {
        global.io.to(`user-${userId}`).emit('transaction-update', {
          type: 'MONEY_ADDED',
          transaction: transaction.toObject(),
          newBalance: walletBalance
        });
      }

      return res.status(200).json({
        success: true,
        message: `Rs ${amount} added to wallet successfully (Mock)`,
        data: {
          transaction: transaction.toObject(),
          newBalance: walletBalance
        }
      });
    }

    if (paymentGateway !== 'RAZORPAY') {
      return res.status(400).json({
        success: false,
        message: 'Unsupported payment gateway'
      });
    }

    if (!hasRazorpayConfig || !razorpayClient) {
      return res.status(503).json({
        success: false,
        message: 'Razorpay is not configured on server'
      });
    }

    if (existingTransaction && existingTransaction.status === 'PENDING') {
      return res.status(200).json({
        success: true,
        message: 'Payment order already created for this request',
        data: {
          transaction: existingTransaction,
          paymentData: {
            key: RAZORPAY_KEY_ID,
            amount: Math.round(existingTransaction.amount * 100),
            currency: 'INR',
            orderId: existingTransaction.gatewayOrderId
          }
        }
      });
    }

    const order = await razorpayClient.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      notes: {
        userId: userId.toString()
      }
    });

    const transaction = await Transaction.create({
      transactionId: crypto.randomBytes(12).toString('hex'),
      receiverId: userId,
      amount,
      type: 'ADD_MONEY',
      description: 'Add money to wallet (Razorpay)',
      paymentGateway: 'RAZORPAY',
      status: 'PENDING',
      idempotencyKey,
      idempotencyUserId: userId,
      gatewayOrderId: order.id,
      gatewayMeta: order
    });

    return res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        transaction,
        paymentData: {
          key: RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          orderId: order.id,
          name: 'Digital Wallet',
          description: 'Add money to wallet',
          prefill: {
            name: req.user.name,
            email: req.user.email
          }
        }
      }
    });
  } catch (error) {
    logger.error('Create payment order error: %s', error.message);
    return next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!hasRazorpayConfig) {
      await session.abortTransaction();
      return res.status(503).json({
        success: false,
        message: 'Razorpay is not configured on server'
      });
    }

    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      transactionId
    } = req.body;

    const userId = req.user._id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      receiverId: userId,
      paymentGateway: 'RAZORPAY'
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Payment transaction not found'
      });
    }

    if (transaction.status === 'SUCCESS') {
      await session.abortTransaction();
      const wallet = await Wallet.findOne({ userId }).select('balance');

      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        data: {
          transaction,
          newBalance: wallet?.balance || 0
        }
      });
    }

    if (transaction.gatewayOrderId !== razorpayOrderId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Order id mismatch'
      });
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(payload).digest('hex');

    const isValidSignature =
      expectedSignature.length === razorpaySignature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpaySignature));

    if (!isValidSignature) {
      await Transaction.updateOne(
        { _id: transaction._id },
        {
          $set: {
            status: 'FAILED',
            gatewayPaymentId: razorpayPaymentId,
            gatewaySignature: razorpaySignature,
            gatewayMeta: {
              ...(transaction.gatewayMeta || {}),
              verifyReason: 'SIGNATURE_MISMATCH'
            }
          }
        },
        { session }
      );
      await session.commitTransaction();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    await Wallet.updateOne(
      { userId },
      {
        $setOnInsert: {
          userId,
          currency: 'INR',
          balance: 0
        },
        $inc: { balance: transaction.amount }
      },
      { upsert: true, session }
    );

    const wallet = await Wallet.findOne({ userId }).session(session);

    const transactionUpdateResult = await Transaction.updateOne(
      {
        _id: transaction._id,
        status: 'PENDING'
      },
      {
        $set: {
          status: 'SUCCESS',
          processedAt: new Date(),
          gatewayPaymentId: razorpayPaymentId,
          gatewaySignature: razorpaySignature,
          balanceSnapshot: {
            receiverBalance: wallet.balance
          }
        }
      },
      { session }
    );

    if (transactionUpdateResult.modifiedCount !== 1) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: 'Payment already processed'
      });
    }

    await session.commitTransaction();

    const updatedTransaction = await Transaction.findById(transaction._id);

    if (global.io) {
      global.io.to(`user-${userId}`).emit('transaction-update', {
        type: 'MONEY_ADDED',
        transaction: updatedTransaction.toObject(),
        newBalance: wallet.balance
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified and wallet updated successfully',
      data: {
        transaction: updatedTransaction,
        newBalance: wallet.balance
      }
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Verify payment error: %s', error.message);
    return next(error);
  } finally {
    session.endSession();
  }
};

const handleWebhook = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint active'
  });
};

const getPaymentMethods = async (req, res, next) => {
  try {
    const paymentMethods = [
      {
        id: 'mock',
        name: 'Mock Payment',
        description: 'Simulated payment for demo/testing',
        enabled: true
      },
      {
        id: 'razorpay',
        name: 'Razorpay',
        description: hasRazorpayConfig ? 'UPI, Cards, NetBanking, Wallets' : 'Configure Razorpay keys in backend .env',
        enabled: hasRazorpayConfig
      }
    ];

    return res.status(200).json({
      success: true,
      data: { paymentMethods }
    });
  } catch (error) {
    logger.error('Get payment methods error: %s', error.message);
    return next(error);
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  getPaymentMethods
};
